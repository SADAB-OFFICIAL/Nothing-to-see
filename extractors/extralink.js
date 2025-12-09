const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extralinkExtractor(url) {
    try {
        console.log('🚀 [DEBUG] ExtraLink Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);
        
        console.log('📄 [DEBUG] Page Title:', $('title').text().trim());

        // --- Step 2: Handle "Generate Download Link" ---
        // Check for Form or Button
        const form = $('form');
        const genBtn = $('a:contains("Generate Download Link"), button:contains("Generate Download Link")');

        let nextUrl = null;

        if (form.length > 0) {
            console.log('🔐 [DEBUG] Found Form. Attempting Submit...');
            // ... (Form submission logic will go here if needed)
            // But let's check logs first to see if it's a form or just a link
            console.log('   Form Action:', form.attr('action'));
        } 
        
        if (genBtn.length > 0) {
             console.log('🔘 [DEBUG] Found Generate Button');
             console.log('   Href:', genBtn.attr('href'));
             console.log('   OnClick:', genBtn.attr('onclick'));
             
             // If it's a direct link (like in screenshot 2 URL structure)
             // Screenshot 2 URL: /s/go/...
             // Let's assume the button takes us there.
        }

        // --- Simulate going to the /s/go/ page manually for now ---
        // Kyunki hume pata hai pattern: /s/ -> /s/go/ (URL badal raha hai screenshot mein)
        // Screenshot 1 URL: https://new3.extralink.ink/s/1c266477/
        // Screenshot 2 URL: https://new3.extralink.ink/s/go/MWMyNjY0Nz...
        
        // Hum pehle page ko analyze karenge ki wo /s/go/ wala link kaise generate kar raha hai.
        
        console.log('-------- HTML DUMP (Generate Button Area) --------');
        // Dump HTML around "Generate Download Link"
        const html = res.data;
        const idx = html.indexOf('Generate Download Link');
        if (idx !== -1) {
            console.log(html.substring(idx - 200, idx + 200));
        }
        console.log('--------------------------------------------------');

        // --- Try to find the API endpoint for "Direct Download" ---
        // Screenshot 3 dikha raha hai "Processing your request..." toast.
        // Ye tabhi hota hai jab koi JS function call hota hai.
        // Hume script tags dhoondhne honge.

        console.log('🔍 [DEBUG] Scanning Scripts for API Logic...');
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && (content.includes('Direct Download') || content.includes('/api') || content.includes('POST'))) {
                console.log(`📜 Script ${i} Match:`, content.substring(0, 500)); // Log first 500 chars
            }
        });

        return streamLinks;

    } catch (error) {
        console.error('❌ ExtraLink Error:', error.message);
        return [];
    }
}

module.exports = extralinkExtractor;
