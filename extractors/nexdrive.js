const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive/MobileJSR Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Visit Main Page ---
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);

        // --- Step 2: Handle "Unlock Download Links" (Form Submission) ---
        // Agar page par form hai aur "Unlock" button hai
        const form = $('form');
        const unlockBtn = $('button:contains("Unlock"), input[value*="Unlock"]');

        if (form.length > 0 && unlockBtn.length > 0) {
            console.log('🔐 Locked Page Detected. Unlocking...');
            
            // Extract Hidden Inputs
            const formData = new URLSearchParams();
            $('input').each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name) formData.append(name, value || '');
            });

            // Form Action URL (Kahan submit karna hai)
            const action = form.attr('action') || url;
            
            // 3 second wait simulation (optional but good for safety)
            await new Promise(r => setTimeout(r, 1000)); 

            // Submit Form (POST)
            const postRes = await axios.post(action, formData, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': url
                }
            });

            // Update Cheerio with new page content (Links Page)
            $ = cheerio.load(postRes.data);
            console.log('🔓 Page Unlocked!');
        }

        // --- Step 3: Find "G-Direct [Instant]" Button ---
        // Hum text ya href se pakdenge
        let fastDlLink = null;
        
        $('a').each((i, el) => {
            const text = $(el).text();
            const href = $(el).attr('href');
            
            // Screenshot ke hisaab se target kar rahe hain
            if (href && (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat'))) {
                fastDlLink = href;
                return false; // Break loop
            }
        });

        if (fastDlLink) {
            console.log('⚡ FastDL Link Found:', fastDlLink);

            // --- Step 4: Visit FastDL Page ---
            const fastRes = await axios.get(fastDlLink, { headers });
            const $$ = cheerio.load(fastRes.data);

            // --- Step 5: Extract Final "Download Now" Link ---
            const finalLink = $$('a:contains("Download Now")').attr('href') || 
                              $$('a.btn-primary').attr('href');

            if (finalLink) {
                console.log('✅ Final Google Link Extracted:', finalLink);
                streamLinks.push({
                    server: 'G-Direct [Instant]',
                    link: finalLink,
                    type: 'mkv' // Google Drive links usually act as direct files
                });
            } else {
                console.log('❌ Could not find Download Now button on FastDL page');
            }

        } else {
            console.log('❌ G-Direct Button not found on links page');
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
