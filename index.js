const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');

// --- Import Extractors ---
const hubcloudExtracter = require('./extractors/hubcloud');
const gdflixExtractor = require('./extractors/gdflix');
const nexdriveExtractor = require('./extractors/nexdrive');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔒 SECURITY: Set your Key here
const API_SECRET = process.env.API_KEY || "sadabefy"; 

// 🚀 CACHING
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

app.use(cors());
app.use(express.json());

// --- Middleware: API Key Checker ---
const authenticate = (req, res, next) => {
    const userKey = req.query.key;
    if (!userKey || userKey !== API_SECRET) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Invalid API Key.' 
        });
    }
    next();
};

// --- Helper: Process Request & Normalize Response ---
async function processRequest(url, extractorFn, res) {
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is missing.' });
    }

    try {
        // 1. Check Cache
        const cachedData = cache.get(url);
        if (cachedData) {
            console.log(`⚡ Served from Cache: ${url}`);
            return res.json(cachedData);
        }

        // 2. Scrape Data
        const result = await extractorFn(url);

        // 3. Normalize Data (Ensure Title + Streams format)
        let responseObj = {};

        if (Array.isArray(result)) {
            // Old format (Just array) -> Wrap it
            responseObj = {
                source: 'live',
                title: "Unknown Title", // Can be updated in other extractors later
                streams: result
            };
        } else {
            // New format (Object with title)
            responseObj = {
                source: 'live',
                title: result.title || "Unknown Title",
                streams: result.streams || []
            };
        }

        // 4. Save to Cache & Send
        if (responseObj.streams && responseObj.streams.length > 0) {
            cache.set(url, responseObj);
            res.json(responseObj);
        } else {
            res.status(404).json({ error: 'No links found', title: responseObj.title });
        }

    } catch (error) {
        console.error('API Internal Error:', error.message);
        res.status(500).json({ error: 'Extraction Failed', details: error.message });
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    res.json({ status: 'Online 🟢', message: 'Universal Extractor API Ready' });
});

app.get('/hubcloud', authenticate, async (req, res) => {
    await processRequest(req.query.url, hubcloudExtracter, res);
});

app.get('/gdflix', authenticate, async (req, res) => {
    await processRequest(req.query.url, gdflixExtractor, res);
});

app.get('/nexdrive', authenticate, async (req, res) => {
    await processRequest(req.query.url, nexdriveExtractor, res);
});

// --- Start ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
