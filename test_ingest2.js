require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    try {
        console.log("Generating embedding...");
        const embeddingRes = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: "Test content",
            config: { outputDimensionality: 768 }
        });
        const embedding = embeddingRes.embeddings?.[0]?.values || embeddingRes.embedding?.values;
        console.log("Embedding length:", embedding.length);

        console.log("Inserting to Supabase...");
        const { error } = await supabase.from('documents').insert({
            content: "Test content",
            metadata: { source: "test.pdf" },
            embedding: embedding
        });
        
        if (error) {
            console.error("Supabase insert error details:", error);
        } else {
            console.log("Insert success!");
        }
    } catch (e) {
        console.error("Error caught:", e);
    }
}
run();
