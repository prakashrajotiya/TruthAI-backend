const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
const chatRouter = require('./routes/chat');
const ingestRouter = require('./routes/ingest');

app.use('/chat', chatRouter);
app.use('/ingest', ingestRouter);
app.use('/has-data', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const { count, error } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        res.json({ hasData: count > 0 });
    } catch (error) {
        console.error("Error checking has-data", error);
        res.status(500).json({ error: error.message });
    }
});

async function startServer() {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

startServer();
