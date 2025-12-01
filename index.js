// index.js
const express = require('express');
const cors = require('cors');
const hubcloudExtracter = require('./extractors/hubcloud');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Home Route
app.get('/', (req, res) => {
    res.json({
        status: 'Active',
        message: 'HubCloud API is running.',
        usage: '/hubcloud?url=https://...'
    });
});

// Main HubCloud Route
app.get('/hubcloud', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ error: 'Please provide a url parameter' });
    }

    try {
        const streams = await hubcloudExtracter(url);
        
        // Response format wahi rakha hai jo PolyMovies expect karta hai
        res.json(streams);
    } catch (error) {
        res.status(500).json({ error: 'Server Error', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
