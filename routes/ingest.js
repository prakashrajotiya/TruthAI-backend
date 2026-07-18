const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Assuming standard @google/genai initialization
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper to chunk text
function chunkText(text, maxChars = 1000) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + maxChars;
        if (end < text.length) {
            // Try to find a natural break point (newline or period)
            let lastBreak = text.lastIndexOf('\n', end);
            if (lastBreak > start) {
                end = lastBreak;
            } else {
                lastBreak = text.lastIndexOf('. ', end);
                if (lastBreak > start) {
                    end = lastBreak + 1;
                }
            }
        }
        chunks.push(text.slice(start, end).trim());
        start = end;
    }
    return chunks.filter(c => c.length > 0);
}

// Upload and ingest PDF
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        
        const fileBuffer = fs.readFileSync(filePath);
        
        console.log("Extracting text with pdf-parse...");
        let extractedText = '';
        
        try {
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text;
        } catch (e) {
            console.error("PDF parse error:", e);
        }
        
        if (!extractedText || extractedText.trim() === '') {
             console.log("No text extracted via pdf-parse. Falling back to Gemini OCR...");
             try {
                 const uploadResult = await ai.files.upload({ file: filePath, config: { mimeType: 'application/pdf' } });
                 
                 const ocrResponse = await ai.models.generateContent({
                     model: 'gemini-2.0-flash',
                     contents: [
                         { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
                         'Extract all the text from this document accurately. Do not summarize, just extract the text.'
                     ]
                 });
                 extractedText = ocrResponse.text;
             } catch (ocrError) {
                 console.error("Gemini OCR error:", ocrError);
             }
        }
        
        if (!extractedText || extractedText.trim() === '') {
             fs.unlinkSync(filePath);
             return res.status(400).json({ error: 'Could not extract text from document. Ensure it is a valid text-based PDF or the AI quota is not exhausted.' });
        }

        // Generate 3 sample questions based on the text for suggestion chips
        let suggestions = [];
        try {
            const qsResponse = await ai.models.generateContent({
                 model: 'gemini-2.0-flash',
                 contents: [
                     { role: 'user', parts: [{ text: `Based on the following text, generate 3 short, relevant questions that a user might ask. Output ONLY the questions, separated by newlines.\n\nText: ${extractedText.substring(0, 3000)}` }] }
                 ]
            });
            suggestions = qsResponse.text.split('\n').filter(q => q.trim().length > 0).slice(0, 3);
        } catch (e) {
            console.warn("API Quota Warning: Could not generate document suggestions. Falling back to default suggestions.");
            suggestions = ["What are the key takeaways?", "Summarize the document", "List the main entities"];
        }
        
        // Chunk text
        const chunks = chunkText(extractedText, 1000);
        
        console.log(`Extracted text into ${chunks.length} chunks. Generating embeddings...`);

        // Generate embeddings and save to Supabase
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            // Add a 3-second delay between requests to avoid hitting the free tier 429 quota limit
            if (i > 0) {
                console.log(`Waiting to avoid rate limit... (${i}/${chunks.length})`);
                await new Promise(resolve => setTimeout(resolve, 4000));
            }

            const embeddingRes = await ai.models.embedContent({
                model: 'gemini-embedding-2',
                contents: chunk,
                config: { outputDimensionality: 768 }
            });
            const embedding = embeddingRes.embeddings?.[0]?.values || embeddingRes.embedding?.values;
            
            const { error } = await supabase.from('documents').insert({
                content: chunk,
                metadata: { source: req.file.originalname },
                embedding: embedding
            });
            
            if (error) {
                console.error("Supabase insert error:", error);
                throw new Error("Failed to insert document into database");
            }
        }
        
        // Clean up
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        
        res.json({ message: 'File ingested successfully', chunks: chunks.length, suggestions });

    } catch (error) {
        console.error('Ingest error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

router.get('/list', async (req, res) => {
    try {
        // Group by source metadata to show unique files
        const { data, error } = await supabase
            .from('documents')
            .select('metadata');
            
        if (error) throw error;
        
        const files = [...new Set(data.map(d => d.metadata.source))];
        res.json({ files });
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/remove', async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }
        
        // In PostgreSQL JSONB querying
        const { error } = await supabase
            .from('documents')
            .delete()
            .contains('metadata', { source: filename });
            
        if (error) throw error;
        
        res.json({ message: 'Document removed successfully' });
    } catch (error) {
        console.error('Remove error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/suggestions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('metadata')
            .limit(50); // Just fetch some to extract filenames
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return res.json({ suggestions: ["What information can you provide?", "How does this chatbot work?"] });
        }
        
        const files = [...new Set(data.map(d => d.metadata.source))].slice(0, 3);
        
        let suggestions = [];
        if (files.length > 0) {
            suggestions.push(`What are the key takeaways from ${files[0]}?`);
            suggestions.push(`Summarize the contents of ${files[Math.min(1, Math.max(0, files.length - 1))]}.`);
            if (files.length > 2) {
                suggestions.push(`Can you explain the main topics in ${files[2]}?`);
            } else {
                suggestions.push("What are the main entities in the document?");
            }
        } else {
            suggestions = ["What are the key takeaways?", "Summarize the document", "List the main entities"];
        }
        
        // Ensure uniqueness
        suggestions = [...new Set(suggestions)];
        
        res.json({ suggestions });
    } catch (error) {
        console.error('Suggestions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
