// Client-side OCR helper. The Gemini API key is NOT used here anymore — image
// parsing is delegated to the /api/parse-order serverless function, which holds
// the key server-side. This keeps the key out of the browser bundle entirely.

import { auth } from '../firebaseConfig';

// Helper to convert a file/blob to a base64 string (no data: prefix).
export const fileToGenerativePart = async (file: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const parseOrderImage = async (base64Image: string) => {
  // The endpoint requires a Firebase ID token and verifies staff membership
  // server-side, so signed-out (or non-staff) callers can't spend Gemini quota.
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('You must be signed in to scan orders.');
  }

  const res = await fetch('/api/parse-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error || '';
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(`Order parsing failed (${res.status}). ${detail}`.trim());
  }

  return res.json();
};
