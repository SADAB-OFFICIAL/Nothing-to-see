const express = require('express');
const cors = require('cors');

// Import Extractors
const hubcloudExtracter = require('./extractors/hubcloud');
const gdFlixExtracter = require('./extractors/gdflix');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// --- Home Route (Status Check) ---
app.get('/', (req, res) => {
    res.json({
        status: 'Online 🟢',
        message: 'Universal Extractor API is running.',
        routes: {
            hubcloud: '/hubcloud?url=YOUR_LINK',
            gdflix: '/gdflix?url=YOUR_LINK'
        },
        maintainer: 'Master Pro Coder'
    });
});

// --- Route 1: HubCloud / V-Cloud / Boblover ---
app.get('/hubcloud', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is missing.' });
    }

    try {
        const streams = await hubcloudExtracter(url);
        res.json(streams);
    } catch (error) {
        console.error('API Error (HubCloud):', error.message);
        res.status(500).json({ error: 'Extraction Failed', details: error.message });
    }
});

// --- Route 2: GDFlix / GDTOT / Sharespark ---
app.get('/gdflix', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is missing.' });
    }

    try {
        const streams = await gdFlixExtracter(url);
        res.json(streams);
    } catch (error) {
        console.error('API Error (GDFlix):', error.message);
        res.status(500).json({ error: 'Extraction Failed', details: error.message });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`👉 Test HubCloud: http://localhost:${PORT}/hubcloud?url=...`);
    console.log(`👉 Test GDFlix: http://localhost:${PORT}/gdflix?url=...`);
});
