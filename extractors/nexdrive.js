const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);
        
        const pageTitle = $('title').text();
        console.log('📄 Page Title:', pageTitle);

        // --- Step 2: "Unlock" Logic (Form Bypass) ---
        // Hum form tag nahi dhoondenge, seedha saare inputs uthayenge
        const formData = new URLSearchParams();
        let inputCount = 0;

        $('input').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) {
                formData.append(name, value || '');
                inputCount++;
            }
        });

        console.log(`🔍 Found ${inputCount} hidden inputs.`);

        // Agar inputs mile hain, matlab Unlock karna padega
        if (inputCount > 0) {
            console.log('⏳ Waiting 3 seconds (Timer simulation)...');
            await sleep(3500);

            // Add fake button click data (Important for some servers)
            if (!formData.has('unlock')) formData.append('unlock', 'Unlock Download Links');
            
            console.log('🔓 Sending POST request to Unlock...');
            
            try {
                const postRes = await axios.post(url, formData, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': url,
                        'Origin': new URL(url).origin,
                        // Cookies agar set-cookie header mein aaye ho
                        'Cookie': res.headers['set-cookie'] ? res.headers['set-cookie'].join('; ') : ''
                    }
                });

                // Update Cheerio with UNLOCKED page
                $ = cheerio.load(postRes.data);
                console.log('✅ POST Request Success. Scanning for links...');
            } catch (postErr) {
                console.log('❌ Unlock POST Failed:', postErr.message);
            }
        } else {
            console.log('ℹ️ No inputs found. Assuming page is already unlocked.');
        }

        // --- Step 3: Find "G-Direct" Link ---
        let fastDlLink = null;

        // Try searching inside all Anchor tags
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // Debug: Print links found to verify
            // console.log(`   🔗 Link Found: ${text} -> ${href}`);

            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                fastDlLink = href;
                return false; // Stop loop
            }
        });

        if (fastDlLink) {
            console.log('⚡ FastDL Link Found:', fastDlLink);

            // --- Step 4: Visit FastDL Page ---
            // Visit the G-Direct link to get the final file
            const fastRes = await axios.get(fastDlLink, { 
                headers: { ...headers, 'Referer': url } 
            });
            const $$ = cheerio.load(fastRes.data);

            // --- Step 5: Extract Final Link ---
            // Target the "Download Now" button on fastdl.lat
            const finalLink = $$('a.btn-primary').attr('href') || 
                              $$('a:contains("Download Now")').attr('href') ||
                              $$('a[href*="googleusercontent"]').attr('href');

            if (finalLink) {
                console.log('✅ Final Link Extracted:', finalLink);
                streamLinks.push({
                    server: 'G-Direct [Instant]',
                    link: finalLink,
                    type: 'mkv'
                });
            } else {
                console.log('❌ Final Download button not found on FastDL page.');
            }

        } else {
            console.log('❌ G-Direct Button not found. (Unlock might have failed or pattern changed)');
            
            // Fallback: Check if there are ANY drive links
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && (href.includes('drive.google.com') || href.includes('pixeldrain'))) {
                    streamLinks.push({
                        server: 'Backup Link',
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
