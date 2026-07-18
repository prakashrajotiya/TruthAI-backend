require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    try {
        const message = "hello";
        const embeddingResponse = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: message,
            config: { outputDimensionality: 768 }
        });
        const queryEmbedding = embeddingResponse.embeddings?.[0]?.values || embeddingResponse.embedding?.values;
        console.log("queryEmbedding length:", queryEmbedding?.length);

        let { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.7,
            match_count: 50
        });

        if (error) {
            console.error('Error fetching documents:', error);
            throw error;
        }
        
        console.log("Docs found:", documents.length);
        
        const systemPrompt = `You are a helpful, accurate chatbot that answers questions strictly based on the provided company data. 
If the answer cannot be found in the provided data, DO NOT hallucinate. 
Instead, state clearly that you do not have the information.
You MUST output your response as a valid JSON object matching this exact structure:
{
  "answer": "Your detailed answer here...",
  "relatedQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}
Ensure the relatedQuestions array contains exactly 3 relevant follow-up questions based on the context.

Context:
Test
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: '{"answer": "Understood. I will answer strictly based on the context and output JSON.", "relatedQuestions": []}' }] },
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });
        console.log("Response:", response.text);
    } catch (e) {
        console.error("Error caught:", e);
    }
}
run();
