import { GoogleGenAI, Type } from "@google/genai";

// Server-side Gemini OCR endpoint. The API key lives only in the serverless
// runtime (process.env.GEMINI_API_KEY) and is never shipped to the browser,
// so it can't be lifted from the JS bundle to run up the bill.

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
    const image: string | undefined = req.body?.image;
    if (!image) {
      res.status(400).json({ error: 'Missing "image" (base64) in request body.' });
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
