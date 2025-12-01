const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

async function gdFlixExtracter(link) {
    try {
        console.log('🚀 GDFlix Logic Started for:', link);
        const streamLinks = [];

        // --- Step 1: Initial Request & Redirect Handling ---
        const res = await axios.get(link, { headers });
        let data = res.data;
        let $ = cheerio.load(data);
        let currentUrl = res.request.res.responseUrl || link;

        // Check JS Redirect (location.replace)
        if (data.includes('location.replace')) {
            const redirectMatch = data.match(/location\.replace\(['"]([^'"]+)['"]\)/);
            if (redirectMatch && redirectMatch[1]) {
                const newLink = redirectMatch[1];
                console.log('🔄 JS Redirect Found:', newLink);
                const newRes = await axios.get(newLink, { headers });
                data = newRes.data;
                $ = cheerio.load(data);
                currentUrl = newLink;
            }
        }

        console.log('📄 Page Parsed. Base URL:', currentUrl);
        const urlObj = new URL(currentUrl);
        const baseUrl = urlObj.origin;

        // --- STRATEGY 1: Instant Link (GDrive/Worker) ---
        // Class '.btn-danger' usually holds the Instant/G-Direct link
        const instantBtn = $('.btn-danger').attr('href');
        
        if (instantBtn) {
            console.log('⚡ Instant Button Found:', instantBtn);
            
            // Case A: Direct Link (No API needed)
            if (!instantBtn.includes('url=') && !instantBtn.includes('id=')) {
                // Check HEAD to resolve final link
                try {
                    const headRes = await axios.head(instantBtn, { headers, maxRedirects: 5 });
                    const finalUrl = headRes.request.res.responseUrl || instantBtn;
                    streamLinks.push({ server: 'G-Drive Direct', link: finalUrl, type: 'mkv' });
                } catch (e) {
                    streamLinks.push({ server: 'G-Drive Direct', link: instantBtn, type: 'mkv' });
                }
            } 
            // Case B: API Token Logic (Standard GDFlix)
            else {
                try {
                    // Token URL se nikalo (after 'url=' or 'id=')
                    const token = instantBtn.split(/url=|id=/)[1]; 
                    const apiUrl = `${baseUrl}/api`;

                    console.log(`🔑 Token: ${token}, API: ${apiUrl}`);

                    // GDFlix API requires FormData
                    const formData = new URLSearchParams();
                    formData.append('keys', token);

                    const apiRes = await axios.post(apiUrl, formData, {
                        headers: {
                            'x-token': currentUrl, // Important: x-token header must be the current page URL
                            'Referer': currentUrl,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    });

                    const apiData = apiRes.data;
                    console.log('📡 API Response:', apiData);

                    if (apiData && apiData.url) {
                        streamLinks.push({ 
                            server: 'G-Drive Instant', 
                            link: apiData.url, 
                            type: 'mkv' 
                        });
                    }
                } catch (err) {
                    console.log('⚠️ Instant API Failed:', err.message);
                }
            }
        }

        // --- STRATEGY 2: Resume/Bot Link (IndexBot/ResumeCloud) ---
        // Class '.btn-secondary' or '.btn-info' usually holds Resume link
        const resumeBtn = $('.btn-secondary, .btn-info').attr('href');

        if (resumeBtn) {
            console.log('🤖 Resume Button Found:', resumeBtn);
            
            // Check if it's an external bot link or internal path
            let botLink = resumeBtn.startsWith('http') ? resumeBtn : `${baseUrl}${resumeBtn}`;

            // Agar internal hai, toh us page par jaake "Login" ya "Download" button dhundo
            try {
                // If it looks like 'indexbot' or 'resume', we might need to dig deeper
                // For now, resolving the redirect is usually enough for the player to handle it
                // Or we can implement the ResumeBot extraction logic (complex)
                
                // Simplified: Just add the link, most players handle the redirect if it's direct
                streamLinks.push({ 
                    server: 'Resume/Index Cloud', 
                    link: botLink, 
                    type: 'mkv' 
                });

                // NOTE: Agar ResumeBot ka bhi token extract karna hai (Jaise tumhare purane code mein tha),
                // toh wo logic yahan add karna padega. 
                // Lekin Instant Link usually sufficient hota hai.

            } catch (err) {
                console.log('⚠️ Resume Path Failed:', err.message);
            }
        }

        // --- STRATEGY 3: Worker Link (Direct .workers.dev) ---
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('workers.dev') || href.includes('cf-worker'))) {
                streamLinks.push({ server: 'CF Worker', link: href, type: 'mkv' });
            }
        });

        // Remove duplicates
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ GDFlix Error:', error.message);
        return [];
    }
}

module.exports = gdFlixExtracter;
