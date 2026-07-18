const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

// Using the standard generative-ai package if @google/genai is tricky to set up, but let's assume @google/genai works.
// Wait, the new SDK is usually imported like: const { GoogleGenAI } = require('@google/genai');
// But if it fails, I'll switch to @google/generative-ai. I'll use @google/generative-ai style just in case it's what was installed if @google/genai doesn't exist, wait I installed @google/genai.
// Let's use @google/genai standard init:
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.post('/', async (req, res) => {
    try {
        const { message, history, selectedDocs } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Generate embedding for the query
        let queryEmbedding = null;
        try {
            const embeddingResponse = await ai.models.embedContent({
                model: 'gemini-embedding-2',
                contents: message,
                config: { outputDimensionality: 768 }
            });
            queryEmbedding = embeddingResponse.embeddings?.[0]?.values || embeddingResponse.embedding?.values;
        } catch (err) {
            if (err.status === 429) {
                console.warn("API Quota Warning: Embedding failed due to 429.");
            } else {
                throw err;
            }
        }

        let documents = [];
        let sources = [];
        let confidence = 0;
        let context = "";

        if (queryEmbedding) {
            // Retrieve similar documents from Supabase (fetch more to filter locally)
            const { data: supaDocs, error } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.7,
                match_count: 50 // fetch 50 to allow local filtering
            });

            if (error) {
                console.error('Error fetching documents:', error);
                throw error;
            }

            documents = supaDocs || [];

            require('fs').writeFileSync('payload_debug.json', JSON.stringify({ selectedDocs, type: typeof selectedDocs, isArray: Array.isArray(selectedDocs) }));
            console.log("Received selectedDocs:", selectedDocs);
            console.log("Documents before filter:", documents.length);
            // Apply local filtering if specific documents are selected (even if empty array, meaning all unchecked)
            if (Array.isArray(selectedDocs)) {
                documents = documents.filter(doc => {
                    console.log("Checking doc source:", doc.metadata?.source);
                    return selectedDocs.includes(doc.metadata?.source);
                });
            }
            console.log("Documents after filter:", documents.length);

            // Take the top 5 after filtering
            documents = documents.slice(0, 5);

            // Construct context
            context = documents.map(doc => doc.content).join('\n\n');

            // Extract sources and confidence
            sources = [...new Set(documents.map(d => d.metadata?.source).filter(Boolean))];
            confidence = documents.length > 0 ? Math.round(documents[0].similarity * 100) : 0;
        }

        const systemPrompt = `You are a helpful, accurate chatbot that answers questions strictly based on the provided company data. 
If the answer cannot be found in the provided Context, DO NOT hallucinate and DO NOT use information from previous chat history. 
Instead, state clearly that you do not have the information.

IMPORTANT RULES:
1. You must ONLY use the provided Context below to answer the user's latest question. 
2. Even if previous messages in the chat history contain the answer, you must IGNORE the chat history if that information is not present in the current Context. The user may have unselected certain documents, so you must strictly respect the current Context.
3. You MUST output your response as a valid JSON object matching this exact structure:
{
  "answer": "Your detailed answer here...",
  "relatedQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}
Ensure the relatedQuestions array contains exactly 3 relevant follow-up questions based on the Context.

Context:
${context}
`;

        // Format history
        const formattedHistory = history ? history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        })) : [];

        // Generate response using Gemini Flash
        let responseText = "";
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt }] },
                    { role: 'model', parts: [{ text: '{"answer": "Understood. I will answer strictly based on the context and output JSON.", "relatedQuestions": []}' }] },
                    ...formattedHistory,
                    { role: 'user', parts: [{ text: message }] }
                ],
                config: {
                    responseMimeType: "application/json"
                }
            });
            responseText = response.text;
        } catch (err) {
            if (err.status === 429) {
                console.warn("API Quota Warning: Chat generation failed due to 429.");
                responseText = JSON.stringify({
                    answer: "I'm currently experiencing high traffic (API quota limits). Please wait a moment and try again!",
                    relatedQuestions: []
                });
            } else {
                throw err;
            }
        }

        let reply;
        try {
            reply = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse Gemini JSON:', responseText);
            reply = { answer: responseText, relatedQuestions: [] };
        }

        res.json({
            response: reply.answer,
            confidence,
            sources,
            relatedQuestions: reply.relatedQuestions
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
