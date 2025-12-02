const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

// Timer helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive/MobileJSR Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load (GET) ---
        const res = await axios.get(url, { headers });
        
        // Capture Cookies (Very Important)
        const rawCookies = res.headers['set-cookie'];
        const cookieHeader = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
        console.log('🍪 Cookies:', cookieHeader || 'None found (might rely on hidden inputs)');

        let $ = cheerio.load(res.data);

        // --- Step 2: Find & Process "Unlock" Form ---
        // Hum saare forms check karenge
        const form = $('form');
        
        // Check if we are on the locked page
        if (form.length > 0) {
            console.log(`🔐 Found ${form.length} form(s). Attempting unlock...`);

            // Pick the first form (usually the correct one on these sites)
            const targetForm = form.first();
            const action = targetForm.attr('action') || url;
            const formData = new URLSearchParams();

            // A. Scrape ALL hidden inputs
            targetForm.find('input').each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name) formData.append(name, value || '');
            });

            // B. Scrape the "Unlock" Button itself (Crucial!)
            // Server needs to know this button was "clicked"
            const btn = targetForm.find('button[type="submit"], input[type="submit"]');
            if (btn.length > 0) {
                const btnName = btn.attr('name');
                const btnValue = btn.attr('value');
                if (btnName) {
                    console.log(`Cx Button Found: ${btnName} = ${btnValue}`);
                    formData.append(btnName, btnValue || '');
                }
            }

            // C. Wait (Timer Logic)
            console.log('⏳ Waiting 3 seconds (Simulating Timer)...');
            await sleep(3500);

            // D. Submit Form (POST)
            console.log('🔓 Sending POST request...');
            const postRes = await axios.post(action, formData, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': url,
                    'Cookie': cookieHeader,
                    'Origin': new URL(url).origin
                }
            });

            // Reload cheerio with the NEW page content (Unlocked)
            $ = cheerio.load(postRes.data);
        } else {
            console.log('ℹ️ No form found. Maybe page is already unlocked?');
        }

        // --- Step 3: Find "G-Direct [Instant]" Link ---
        let fastDlLink = null;

        // Try exact text matching from your screenshot
        const targetText = ['G-Direct', 'Instant', 'G-Direct [Instant]'];
        
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // Check if text matches our target
            const isMatch = targetText.some(t => text.includes(t)) || href.includes('fastdl.lat');
            
            if (isMatch) {
                fastDlLink = href;
                return false; // Break loop
            }
        });

        if (fastDlLink) {
            console.log('⚡ FastDL Link Found:', fastDlLink);

            // --- Step 4: Visit FastDL Page ---
            const fastRes = await axios.get(fastDlLink, { 
                headers: { ...headers, 'Referer': url } // Referer is important here
            });
            const $$ = cheerio.load(fastRes.data);

            // --- Step 5: Extract Final "Download Now" Link ---
            // Screenshot 4: "Download Now" button
            const finalLink = $$('a.btn-primary:contains("Download Now")').attr('href') ||
                              $$('a:contains("Download Now")').attr('href') ||
                              $$('a[href*="googleusercontent"]').attr('href'); // Strongest check

            if (finalLink) {
                console.log('✅ Final Link Extracted!');
                streamLinks.push({
                    server: 'G-Direct [Instant]',
                    link: finalLink,
                    type: 'mkv'
                });
            } else {
                console.log('❌ FastDL page opened, but "Download Now" link missing.');
            }

        } else {
            console.log('❌ G-Direct Button not found after unlock.');
            // Debug: Check titles of links we DID find
            // $('a').each((i, el) => console.log('Found Link:', $(el).text().trim()));
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
