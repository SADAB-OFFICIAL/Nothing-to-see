const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');

// --- Import Extractors ---
const hubcloudExtracter = require('./extractors/hubcloud');
const gdflixExtractor = require('./extractors/gdflix');
const nexdriveExtractor = require('./extractors/nexdrive');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔒 SECURITY: Apni Secret Key yahan set karo
// Request karte waqt url me ?key=MY_SUPER_SECRET_KEY lagana padega
const API_SECRET = process.env.API_KEY || "sadabefy"; 

// 🚀 CACHING: Data 10 minute (600 seconds) tak save rahega
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

app.use(cors());
app.use(express.json());

// --- Middleware: API Key Checker ---
const authenticate = (req, res, next) => {
    const userKey = req.query.key;
    
    // Agar key match nahi hoti
    if (!userKey || userKey !== API_SECRET) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Invalid or missing API Key. FUCK OFF 🦍🗿' 
        });
    }
    next();
};

// --- Helper: Cache Handler ---
// Ye function pehle cache check karta hai, agar nahi mila to scrape karta hai
async function processRequest(url, extractorFn, res) {
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is missing.' });
    }

    try {
        // 1. Check Cache
        const cachedData = cache.get(url);
        if (cachedData) {
            console.log(`⚡ Served from Cache: ${url}`);
            return res.json({ 
                source: 'cache', 
                streams: cachedData 
            });
        }

        // 2. Scrape Data (Agar cache me nahi hai)
        const streams = await extractorFn(url);

        // 3. Save to Cache (Sirf tab jab streams milein)
        if (streams && streams.length > 0) {
            cache.set(url, streams);
            console.log(`💾 Saved to Cache: ${url}`);
        }

        // 4. Send Response
        res.json({ 
            source: 'live', 
            streams: streams 
        });

    } catch (error) {
        console.error('API Internal Error:', error.message);
        res.status(500).json({ error: 'Extraction Failed', details: error.message });
    }
}

// --- Routes ---

app.get('/', (req, res) => {
    res.json({
        status: 'Online 🟢',
        security: 'Enabled 🔒',
        message: 'Universal Extractor API is running.',
        DMonTG: `@SADAB_MOD_OWNER`
    });
});

// 1. HubCloud / V-Cloud
app.get('/hubcloud', authenticate, async (req, res) => {
    await processRequest(req.query.url, hubcloudExtracter, res);
});

// 2. GDFlix / GDTOT
app.get('/gdflix', authenticate, async (req, res) => {
    await processRequest(req.query.url, gdflixExtractor, res);
});

// 3. NexDrive / MobileJSR
app.get('/nexdrive', authenticate, async (req, res) => {
    await processRequest(req.query.url, nexdriveExtractor, res);
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Secure Server running on port ${PORT}`);
    console.log(`🔑 API Key: ${API_SECRET}`);
    console.log(`⚡ Caching Enabled (10 Minutes)`);
    console.log(`=================================================`);
});
