const express = require('express');
const cors = require('cors');
const path = require('path'); 
const NodeCache = require('node-cache');

// --- Import Extractors ---
const hubcloudExtracter = require('./extractors/hubcloud');
const gdflixExtractor = require('./extractors/gdflix');
const nexdriveExtractor = require('./extractors/nexdrive');

// --- Import Checker (NEW) ---
const checkStreams = require('./utils/checker');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔒 SECURITY
const API_SECRET = process.env.API_KEY || "sadabefy"; 

// 🚀 CACHING
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth Middleware ---
const authenticate = (req, res, next) => {
    const userKey = req.query.key;
    if (!userKey || userKey !== API_SECRET) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Invalid or missing API Key.' 
        });
    }
    next();
};

// --- Helper: Process Request ---
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

        // 3. Normalize Data
        let responseObj = {};
        let rawStreams = [];

        if (Array.isArray(result)) {
            responseObj = {
                source: 'live',
                title: "Unknown Title",
                streams: []
            };
            rawStreams = result;
        } else {
            responseObj = {
                source: 'live',
                title: result.title || "Unknown Title",
                streams: []
            };
            rawStreams = result.streams || [];
        }

        // 4. 🚦 CHECK LINK HEALTH (NEW STEP)
        if (rawStreams.length > 0) {
            console.log('🔍 Verifying links...');
            const validStreams = await checkStreams(rawStreams);
            responseObj.streams = validStreams;
        }

        // 5. Save to Cache & Send
        if (responseObj.streams.length > 0) {
            cache.set(url, responseObj);
            console.log(`💾 Saved to Cache: ${url} (${responseObj.streams.length} links)`);
            res.json(responseObj);
        } else {
            res.status(404).json({ error: 'No working links found', title: responseObj.title });
        }

    } catch (error) {
        console.error('API Internal Error:', error.message);
        res.status(500).json({ error: 'Extraction Failed', details: error.message });
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    res.json({ 
        status: 'Online 🟢', 
        message: 'Universal Extractor API Ready',
        ui: '/download.html' 
    });
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
    console.log(`=================================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🚦 Link Health Checker: Active`);
    console.log(`📂 UI Available at: http://localhost:${PORT}/download.html`);
    console.log(`=================================================`);
});
