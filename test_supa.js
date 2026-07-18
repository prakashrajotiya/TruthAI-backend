require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const { data: countData, error: countErr } = await supabase.from('documents').select('id', { count: 'exact' });
    console.log("Current documents count:", countData?.length, "Error:", countErr);

    console.log("Generating embedding...");
    const embeddingRes = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: "Test content for supabase insert",
        config: { outputDimensionality: 768 }
    });
    const embedding = embeddingRes.embeddings?.[0]?.values || embeddingRes.embedding?.values;
    
    console.log("Embedding length:", embedding.length);

    console.log("Inserting into Supabase...");
    const { error } = await supabase.from('documents').insert({
        content: "Test content for supabase insert",
        metadata: { source: "test_file.pdf" },
        embedding: embedding
    });
    
    if (error) {
      console.error("Supabase insert error details:", error);
    } else {
      console.log("Successfully inserted!");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
