const express = require('express');
const cors = require('cors');

// --- Import Extractors ---
const hubcloudExtracter = require('./extractors/hubcloud');
const gdFlixExtracter = require('./extractors/gdflix');
const nexdriveExtractor = require('./extractors/nexdrive'); // New Addition

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// --- Home Route (Status & Info) ---
app.get('/', (req, res) => {
    res.json({
        status: 'Online 🟢',
        message: 'Universal Media Extractor API',
        endpoints: {
            hubcloud: '/hubcloud?url=https://hubcloud.link/...',
            gdflix: '/gdflix?url=https://gdflix.net/...',
            nexdrive: '/nexdrive?url=https://mobilejsr.lol/...'
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

// --- Route 3: NexDrive / MobileJSR ---
app.get('/nexdrive', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is missing.' });
    }

    try {
        const streams = await nexdriveExtractor(url);
        res.json(streams);
    } catch (error) {
        console.error('API Error (NexDrive):', error.message);
        res.status(500).json({ error: 'Extraction Failed', details: error.message });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Universal Extractor Server running on port ${PORT}`);
    console.log(`=================================================`);
    console.log(`👉 HubCloud: http://localhost:${PORT}/hubcloud`);
    console.log(`👉 GDFlix:   http://localhost:${PORT}/gdflix`);
    console.log(`👉 NexDrive: http://localhost:${PORT}/nexdrive`);
    console.log(`=================================================`);
});
