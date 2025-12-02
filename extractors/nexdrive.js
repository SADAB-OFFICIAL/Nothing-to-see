const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

// Helper for Base64 Decoding
const decodeBase64 = (str) => {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch (e) {
        return '';
    }
};

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        const html = res.data;
        let $ = cheerio.load(html);

        // --- Step 2: Extract Encoded Content (Client-Side Unlock) ---
        // Look for the script containing 'const encoded ='
        const scriptContent = $('script:contains("const encoded =")').html();
        
        if (scriptContent) {
            console.log('🔐 Found Encoded Data. Decoding...');
            
            // Extract the base64 string using Regex
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            
            if (match && match[1]) {
                const encodedData = match[1];
                const decodedHtml = decodeBase64(encodedData);
                
                // Load decoded HTML into Cheerio
                // Note: The decoded HTML contains the buttons we need
                $ = cheerio.load(decodedHtml);
                console.log('🔓 Decoded Successfully! Scanning for links...');
            } else {
                console.log('⚠️ Encoded string regex mismatch');
            }
        } else {
            console.log('ℹ️ No encoded script found. Page might be unlocked or different format.');
        }

        // --- Step 3: Find "G-Direct [Instant]" Link ---
        let fastDlLink = null;

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // Target "G-Direct" or "fastdl"
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                fastDlLink = href;
                return false; // Stop loop
            }
        });

        if (fastDlLink) {
            console.log('⚡ FastDL Link Found:', fastDlLink);

            // --- Step 4: Visit FastDL Page ---
            const fastRes = await axios.get(fastDlLink, { 
                headers: { ...headers, 'Referer': url } 
            });
            const $$ = cheerio.load(fastRes.data);

            // --- Step 5: Extract Final "Download Now" Link ---
            const finalLink = $$('a.btn-primary').attr('href') || 
                              $$('a:contains("Download Now")').attr('href') ||
                              $$('a[href*="googleusercontent"]').attr('href');

            if (finalLink) {
                console.log('✅ Final Link Extracted!');
                streamLinks.push({
                    server: 'G-Direct [Instant]',
                    link: finalLink,
                    type: 'mkv'
                });
            } else {
                console.log('❌ Final Download button not found on FastDL page.');
            }

        } else {
            // Fallback: Check for other links in decoded HTML
            console.log('⚠️ G-Direct not found. Checking alternatives...');
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                
                if (href && (href.includes('drive.google.com') || href.includes('pixeldrain') || href.includes('gofile'))) {
                    streamLinks.push({
                        server: text || 'Backup Link',
                        link: href,
                        type: 'mkv'
                    });
                }
            });
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
