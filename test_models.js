require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.list();
    console.log(response);
  } catch (error) {
    console.error("Error:", error);
  }
}
run();
