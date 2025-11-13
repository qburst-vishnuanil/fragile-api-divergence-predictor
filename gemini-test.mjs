import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

console.log("Key exists?", !!apiKey);

const genAI = new GoogleGenerativeAI(apiKey);

try {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const result = await model.generateContent("Say OK");
  console.log("Gemini Output:", result.response.text());

} catch (err) {
  console.error("Gemini Error:", err);
}
