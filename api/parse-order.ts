import { GoogleGenAI, Type } from "@google/genai";

// Server-side Gemini OCR endpoint. The API key lives only in the serverless
// runtime (process.env.GEMINI_API_KEY) and is never shipped to the browser,
// so it can't be lifted from the JS bundle to run up the bill.

const PROJECT_ID =
  process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'order-accuracy-ce844';

// Roughly 4.5MB of decoded image — matches Vercel's own body limit, but fails
// with a clear message instead of a platform error.
const MAX_IMAGE_CHARS = 6_000_000;

// Staff verification: read the caller's own crew/managers profile doc through
// the Firestore REST API *with the caller's ID token*. Google validates the
// token (401 if forged/expired) and our security rules only permit self-reads,
// so a 200 proves the uid in the token belongs to a real staff profile. This
// keeps the endpoint from being an open Gemini spend faucet without needing a
// service account in the serverless environment.
const uidFromToken = (idToken: string): string | null => {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8'));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
};

// Cache verified tokens for a warm lambda so repeated scans don't re-read
// Firestore. Keyed by the exact token (already proven valid), never by uid.
const verifiedTokens = new Map<string, number>();
const VERIFY_TTL_MS = 5 * 60 * 1000;

const isStaffToken = async (idToken: string): Promise<boolean> => {
  const now = Date.now();
  const cached = verifiedTokens.get(idToken);
  if (cached && cached > now) return true;

  const uid = uidFromToken(idToken);
  if (!uid) return false;

  for (const collection of ['crew', 'managers']) {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (res.ok) {
      if (verifiedTokens.size > 500) verifiedTokens.clear();
      verifiedTokens.set(idToken, now + VERIFY_TTL_MS);
      return true;
    }
  }
  return false;
};

let ai: GoogleGenAI | null = null;
const getClient = (): GoogleGenAI => {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

const PROMPT = `
  Analyze this image of a food order receipt or screen.
  Extract the following information in JSON format:
  - orderId (string)
  - customerName (string, use "Guest" if unknown)
  - customerPhone (string, optional)
  - customerOrderCount (number, optional): Look for text indicating total historical orders.
    Specific patterns to look for:
    1. "[Number] orders by [Name]" (e.g., "6 orders by Tyas Syahid") -> extract 6.
    2. "Orders placed till date: [Number]" -> extract the number.
    3. "Visit #[Number]" or "Total Orders: [Number]".
    If found, return the number. If not found, return 1.
  - totalAmount (number, optional)
  - items: Array of objects with:
    - name (string)
    - quantity (number)
    - category (string, strictly "food" or "drink". Guess based on item name. E.g., Latte, Tea, Coke = drink. Rice, Bowl, Sandwich, Cake = food)
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    orderId: { type: Type.STRING },
    customerName: { type: Type.STRING },
    customerPhone: { type: Type.STRING },
    customerOrderCount: { type: Type.NUMBER },
    totalAmount: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          category: { type: Type.STRING, enum: ["food", "drink"] }
        }
      }
    }
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader: string = req.headers?.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken || !(await isStaffToken(idToken))) {
      res.status(401).json({ error: 'Sign in as staff to use order scanning.' });
      return;
    }

    const image: string | undefined = req.body?.image;
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'Missing "image" (base64) in request body.' });
      return;
    }
    if (image.length > MAX_IMAGE_CHARS) {
      res.status(413).json({ error: 'Image too large. Please retake or compress the photo.' });
      return;
    }

    const response = await getClient().models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: image } },
          { text: PROMPT }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const text = response.text;
    if (!text) {
      res.status(502).json({ error: 'No response from AI' });
      return;
    }

    res.status(200).json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini OCR Error:", error);
    res.status(500).json({ error: error?.message || 'AI processing failed.' });
  }
}
