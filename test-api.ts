import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "dummy-key" });
ai.models.generateContent({
  model: "gemini-3.1-pro-preview",
  contents: "Hello"
}).then(res => console.log(res.text)).catch(err => console.error(err.message));
