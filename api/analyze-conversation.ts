import { GoogleGenAI, Type } from "@google/genai";

// Server-side Gemini analysis of a counter conversation recording: one call
// returns both the transcript and a coaching rubric. Runs on-demand (admin
// clicks Analyze) so Gemini spend scales with clips reviewed, not recorded.
// Same auth model as parse-order.ts: the caller's Firebase ID token is
// verified by reading their own crew/managers profile via the Firestore REST
// API — Google validates the token, our rules only permit self-reads.

const PROJECT_ID =
  process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'order-accuracy-ce844';

// Audio chunks are ~1-2MB (32kbps Opus); anything near this limit is wrong.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const uidFromToken = (idToken: string): string | null => {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8'));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
};

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
  This is an audio recording of a cafe counter interaction between a crew
  member (staff) and customers, recorded for staff training purposes.

  1. Transcribe the conversation. Label speakers as "Crew:" and "Customer:"
     where distinguishable. If parts are inaudible, write [inaudible]. If the
     audio contains no conversation (silence/background noise), say so in the
     transcript and score all rubric items 5 with a tip explaining there was
     no conversation to assess.

  2. Coach the crew member's customer service on a 1-10 scale for each of:
     - greeting: did they welcome the customer promptly and warmly?
     - friendliness: tone, politeness, warmth throughout.
     - clarity: clear communication, confirming the order correctly.
     - upsellAttempt: did they suggest add-ons, combos or larger sizes naturally?
     - closing: thanking the customer, clear handoff / wait-time expectations.
     - overallScore: overall impression.

  3. Give 2-4 short, specific, encouraging improvement tips a cafe trainer
     would give, referencing what was actually said.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    coaching: {
      type: Type.OBJECT,
      properties: {
        greeting: { type: Type.NUMBER },
        friendliness: { type: Type.NUMBER },
        clarity: { type: Type.NUMBER },
        upsellAttempt: { type: Type.NUMBER },
        closing: { type: Type.NUMBER },
        overallScore: { type: Type.NUMBER },
        tips: { type: Type.ARRAY, items: { type: Type.STRING } }
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
      res.status(401).json({ error: 'Sign in as staff to analyze recordings.' });
      return;
    }

    const downloadUrl: string | undefined = req.body?.downloadUrl;
    if (!downloadUrl || typeof downloadUrl !== 'string') {
      res.status(400).json({ error: 'Missing "downloadUrl" in request body.' });
      return;
    }
    // Only fetch from Firebase Storage — this endpoint must not be usable as
    // a generic URL fetcher.
    if (!downloadUrl.startsWith('https://firebasestorage.googleapis.com/')) {
      res.status(400).json({ error: 'downloadUrl must be a Firebase Storage URL.' });
      return;
    }

    const audioRes = await fetch(downloadUrl);
    if (!audioRes.ok) {
      res.status(400).json({ error: `Could not fetch the recording (${audioRes.status}). It may have expired.` });
      return;
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    if (buf.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: 'Recording too large to analyze.' });
      return;
    }
    const mimeType = audioRes.headers.get('content-type') || 'audio/webm';

    const response = await getClient().models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: buf.toString('base64') } },
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
    console.error("Gemini conversation analysis error:", error);
    res.status(500).json({ error: error?.message || 'AI processing failed.' });
  }
}
