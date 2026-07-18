require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    console.log("Generating embedding...");
    const embeddingRes = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: "Hello world",
        config: {
            outputDimensionality: 768
        }
    });
    console.log("Success! Values length:", embeddingRes.embeddings?.[0]?.values?.length || embeddingRes.embedding?.values?.length);
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
