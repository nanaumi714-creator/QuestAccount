import { GoogleGenAI } from '@google/genai';

export type AiProviderName = 'gemini' | 'openai';

export type ClassificationResult = {
  household_category: string;
  business_category: string | null;
  purpose: 'personal' | 'business' | 'mixed';
  confidence: number;
};

export type OcrResult = {
  date: string;
  amount: number;
  store_name: string;
  direction: 'expense' | 'income';
};

export interface AiProvider {
  provider: AiProviderName;
  classifyTransaction(input: { storeName: string; amount: number; direction: string; date: string }): Promise<ClassificationResult>;
  readReceipt(input: { imageBase64: string; mimeType: string }): Promise<OcrResult>;
}

function parseJson<T>(text: string | null | undefined): T {
  if (!text) {
    throw new Error('AI response was empty');
  }
  return JSON.parse(text) as T;
}

function extractTextFromOpenAiResponse(data: any): string {
  return data?.output_text || data?.output?.[0]?.content?.[0]?.text || '';
}

async function requestOpenAi(apiKey: string, payload: unknown): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  return response.json();
}

function createGeminiProvider(apiKey: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });

  return {
    provider: 'gemini',
    async classifyTransaction(input) {
      const prompt = `
Analyze this transaction and classify it.
Store: ${input.storeName}
Amount: ${input.amount}
Direction: ${input.direction}
Date: ${input.date}

Return JSON format:
{
  "household_category": "string (e.g., 食費, 日用品, 通信費, 交通費, 交際費, 趣味, その他)",
  "business_category": "string (e.g., 消耗品費, 通信費, 旅費交通費, 接待交際費, 会議費, その他) or null",
  "purpose": "personal" | "business" | "mixed",
  "confidence": number (0.0 to 1.0)
}
`;
      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return parseJson<ClassificationResult>(response.text);
    },
    async readReceipt(input) {
      const prompt = `
Extract transaction details from this receipt image.
Return ONLY a JSON object with the following structure:
{
  "date": "YYYY-MM-DD",
  "amount": number (total amount, integer),
  "store_name": "string",
  "direction": "expense"
}
`;
      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [{ inlineData: { data: input.imageBase64, mimeType: input.mimeType } }, { text: prompt }],
        },
        config: { responseMimeType: 'application/json' },
      });
      return parseJson<OcrResult>(response.text);
    },
  };
}

function createOpenAiProvider(apiKey: string): AiProvider {
  return {
    provider: 'openai',
    async classifyTransaction(input) {
      const data = await requestOpenAi(apiKey, {
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: 'You are a bookkeeping assistant. Return JSON only.',
          },
          {
            role: 'user',
            content: `Store: ${input.storeName}\nAmount: ${input.amount}\nDirection: ${input.direction}\nDate: ${input.date}\nReturn keys: household_category,business_category,purpose,confidence.`,
          },
        ],
      });
      return parseJson<ClassificationResult>(extractTextFromOpenAiResponse(data));
    },
    async readReceipt(input) {
      const data = await requestOpenAi(apiKey, {
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Extract date, amount, store_name, direction (expense or income). Return JSON only.' },
              { type: 'input_image', image_url: `data:${input.mimeType};base64,${input.imageBase64}` },
            ],
          },
        ],
      });
      return parseJson<OcrResult>(extractTextFromOpenAiResponse(data));
    },
  };
}

export function createAiProviderFromEnv(): AiProvider | null {
  const configured = (process.env.AI_PROVIDER || '').toLowerCase();

  if (configured === 'openai') {
    return process.env.OPENAI_API_KEY ? createOpenAiProvider(process.env.OPENAI_API_KEY) : null;
  }

  if (configured === 'gemini') {
    return process.env.GEMINI_API_KEY ? createGeminiProvider(process.env.GEMINI_API_KEY) : null;
  }

  if (process.env.OPENAI_API_KEY) {
    return createOpenAiProvider(process.env.OPENAI_API_KEY);
  }
  if (process.env.GEMINI_API_KEY) {
    return createGeminiProvider(process.env.GEMINI_API_KEY);
  }
  return null;
}
