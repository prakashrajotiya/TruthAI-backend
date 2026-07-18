require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Create a dummy PDF file for testing
    fs.writeFileSync('dummy.pdf', '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 21 >>\nstream\nBT /F1 12 Tf 100 700 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000219 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n289\n%%EOF');
    
    const base64Data = fs.readFileSync('dummy.pdf').toString('base64');
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
            {
                role: 'user',
                parts: [
                    { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
                    { text: 'Extract all the text from this document accurately. Do not summarize, just extract the text.' }
                ]
            }
        ]
    });
    console.log("Success:", response.text);
  } catch (error) {
    console.error("Error:", error);
  }
}
run();
