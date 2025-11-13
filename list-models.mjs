import { GoogleGenerativeAI } from "@google/generative-ai";

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

try {
  const response = await client.listModels();
  console.log(JSON.stringify(response.models, null, 2));
} catch (err) {
  console.error("Model list error:", err);
}
