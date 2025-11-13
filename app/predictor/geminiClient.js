import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(apiKey);

export async function generateFromGemini(prompt) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash" // 🟢 More stable model
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}
