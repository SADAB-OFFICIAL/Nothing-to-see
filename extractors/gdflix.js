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

        // --- STRATEGY 1: Instant Link (Processing busycdn / fastcdn) ---
        const instantBtn = $('.btn-danger').attr('href');
        
        if (instantBtn) {
            console.log('⚡ Instant Button Found:', instantBtn);
            
            // Check if it's the "BusyCDN" / "FastCDN" style link
            if (instantBtn.includes('busycdn') || instantBtn.includes('fastcdn') || instantBtn.includes('pages.dev')) {
                try {
                    console.log('⏳ Visiting Intermediate Page:', instantBtn);
                    
                    // Fetch the intermediate page (The one in your screenshot)
                    const intRes = await axios.get(instantBtn, { headers });
                    const intHtml = intRes.data;
                    const $$ = cheerio.load(intHtml);

                    // 1. Try finding 'url=' inside the script tag or meta refresh
                    // Screenshot page URL structure is usually: ...?url=https://final-link...
                    const urlParamMatch = instantBtn.match(/[?&]url=([^&]+)/);
                    
                    if (urlParamMatch) {
                        const finalLink = decodeURIComponent(urlParamMatch[1]);
                        console.log('✅ Found Direct Link from URL Param:', finalLink);
                        streamLinks.push({ server: 'G-Drive Direct', link: finalLink, type: 'mkv' });
                    } 
                    // 2. Try parsing the "Download Here" button from HTML
                    else {
                        const downloadHref = $$('a[id="download"], a.btn-primary, a:contains("Download Here")').attr('href');
                        
                        if (downloadHref && downloadHref !== '#') {
                            console.log('✅ Found Direct Link from Button:', downloadHref);
                            streamLinks.push({ server: 'G-Drive Direct', link: downloadHref, type: 'mkv' });
                        } 
                        // 3. Script Variable Extraction (Most likely scenario for 'One Click')
                        else {
                            const scriptUrl = intHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                              intHtml.match(/window\.open\(["']([^"']+)["']\)/i) ||
                                              intHtml.match(/let\s+url\s*=\s*["']([^"']+)["']/i);
                            
                            if (scriptUrl && scriptUrl[1]) {
                                console.log('✅ Found Direct Link from Script:', scriptUrl[1]);
                                streamLinks.push({ server: 'G-Drive Direct', link: scriptUrl[1], type: 'mkv' });
                            } else {
                                console.log('⚠️ Could not extract final link from intermediate page. pushing original.');
                                streamLinks.push({ server: 'Instant Link (Verify)', link: instantBtn, type: 'mkv' });
                            }
                        }
                    }

                } catch (e) {
                    console.log('❌ Error visiting intermediate page:', e.message);
                    streamLinks.push({ server: 'Instant Link', link: instantBtn, type: 'mkv' });
                }
            } 
            // Case B: Old API Token Logic (Keep this as backup)
            else if (instantBtn.includes('url=') || instantBtn.includes('id=')) {
                // ... (Existing API Logic code remains same) ...
                try {
                    const token = instantBtn.split(/url=|id=/)[1]; 
                    const apiUrl = `${baseUrl}/api`;
                    const formData = new URLSearchParams();
                    formData.append('keys', token);

                    const apiRes = await axios.post(apiUrl, formData, {
                        headers: { 'x-token': currentUrl, 'Referer': currentUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    if (apiRes.data && apiRes.data.url) {
                        streamLinks.push({ server: 'G-Drive Instant', link: apiRes.data.url, type: 'mkv' });
                    }
                } catch(err) { console.log(err.message); }
            }
            // Case C: Direct Link
            else {
                streamLinks.push({ server: 'G-Drive Direct', link: instantBtn, type: 'mkv' });
            }
        }

        // --- STRATEGY 2: Resume/Bot Link ---
        const resumeBtn = $('.btn-secondary, .btn-info').attr('href');
        if (resumeBtn) {
            console.log('🤖 Resume Button Found:', resumeBtn);
            let botLink = resumeBtn.startsWith('http') ? resumeBtn : `${baseUrl}${resumeBtn}`;
            streamLinks.push({ server: 'Resume/Index Cloud', link: botLink, type: 'mkv' });
        }

        // --- STRATEGY 3: Worker Link ---
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
