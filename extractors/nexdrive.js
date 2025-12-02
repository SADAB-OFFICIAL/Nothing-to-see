const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

// Helper to simulate waiting (Timer)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive/MobileJSR Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load (GET) ---
        // Cookies capture karna zaroori hai
        const res = await axios.get(url, { headers });
        const rawCookies = res.headers['set-cookie']; // Capture Cookies
        const cookieHeader = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
        
        console.log('🍪 Cookies Captured:', cookieHeader ? 'Yes' : 'No');

        let $ = cheerio.load(res.data);

        // --- Step 2: Handle Unlock Form ---
        const form = $('form[method="POST"]'); // Usually valid form is POST
        const unlockBtn = $('button:contains("Unlock"), input[value*="Unlock"], #btn-1');

        if (form.length > 0) {
            console.log('🔐 Locked Page Detected. Parsing Form...');
            
            // Extract all hidden inputs required for submission
            const formData = new URLSearchParams();
            $('input', form).each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name) formData.append(name, value || '');
            });

            // Timer Wait (Simulate User)
            console.log('⏳ Waiting 4 seconds for timer...');
            await sleep(4500); 

            // Form Action (Same URL usually)
            const action = form.attr('action') || url;

            console.log('🔓 Submitting Unlock Request...');
            
            // --- Step 3: Submit Form (POST) with COOKIES ---
            const postRes = await axios.post(action, formData, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': url,
                    'Cookie': cookieHeader, // VERY IMPORTANT
                    'Origin': new URL(url).origin
                }
            });

            // Update Cheerio with the UNLOCKED HTML
            $ = cheerio.load(postRes.data);
            
            // Debug check
            if ($('button:contains("Unlock")').length > 0) {
                console.log('⚠️ Warning: Still on Unlock page. Cookie/Token might be invalid.');
            } else {
                console.log('✅ Page Unlocked Successfully!');
            }
        }

        // --- Step 4: Find G-Direct Button ---
        let fastDlLink = null;
        
        // Try multiple selectors for the button
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#') return;

            // Target "G-Direct [Instant]"
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                fastDlLink = href;
                return false; // Stop loop
            }
        });

        if (fastDlLink) {
            console.log('⚡ FastDL Link Found:', fastDlLink);

            // --- Step 5: Visit FastDL Page (Final Step) ---
            const fastRes = await axios.get(fastDlLink, { 
                headers: { ...headers, 'Referer': url } 
            });
            const $$ = cheerio.load(fastRes.data);

            // Extract Final Google Link
            const finalLink = $$('a.btn-primary').attr('href') || 
                              $$('a:contains("Download Now")').attr('href') ||
                              $$('a[href*="googleusercontent"]').attr('href');

            if (finalLink) {
                console.log('✅ Final Google Link Extracted!');
                streamLinks.push({
                    server: 'G-Direct [Instant]',
                    link: finalLink,
                    type: 'mkv'
                });
            } else {
                console.log('❌ Download Now button missing on FastDL page');
            }

        } else {
            console.log('❌ G-Direct Button not found. HTML Dump (Partial):');
            // Log partial HTML to debug if buttons are missing
            console.log($.html().substring(0, 500)); 
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
