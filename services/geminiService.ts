
import { GoogleGenAI, Type } from "@google/genai";

// Lazily create the client. Instantiating at module load with a missing/empty
// API key throws ("An API Key must be set...") which, in the production bundle,
// runs at startup and blanks the whole app. Defer it until OCR is actually used.
let ai: GoogleGenAI | null = null;
const getClient = (): GoogleGenAI => {
  if (!ai) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key is not configured. Set GEMINI_API_KEY to use AI order parsing.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
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
  try {
    const modelId = 'gemini-2.0-flash';
    
    // We ask Gemini to extract structured data
    const prompt = `
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

    const response = await getClient().models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
        }
      }
    });

    /* Correctly accessing .text property of GenerateContentResponse */
    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
};
