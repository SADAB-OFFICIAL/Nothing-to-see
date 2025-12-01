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

        // Handle JS Redirection (location.replace)
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

        // --- STRATEGY 1: Instant Link (Handling BusyCDN / FastCDN) ---
        const instantBtn = $('.btn-danger').attr('href');
        
        if (instantBtn) {
            console.log('⚡ Instant Button Found:', instantBtn);
            
            // Check for BusyCDN / FastCDN / Pages.dev pattern
            if (instantBtn.includes('busycdn') || instantBtn.includes('fastcdn') || instantBtn.includes('pages.dev')) {
                try {
                    console.log('⏳ Visiting Intermediate Page:', instantBtn);
                    
                    const intRes = await axios.get(instantBtn, { 
                        headers,
                        maxRedirects: 5 // Ensure we follow redirects to reach fastcdn-dl.pages.dev
                    });
                    
                    const intHtml = intRes.data;
                    const finalPageUrl = intRes.request.res.responseUrl || instantBtn;
                    
                    console.log('📍 Final Landing URL:', finalPageUrl);

                    let finalLink = null;

                    // Method A: Check URL Parameters (Screenshot shows ?url=...)
                    // Yeh sabse strong check hai based on your screenshot
                    if (finalPageUrl.includes('?url=')) {
                        const extracted = finalPageUrl.split('?url=')[1].split('&')[0];
                        if (extracted) {
                            finalLink = decodeURIComponent(extracted);
                            console.log('✅ Found Direct Link in URL Param:', finalLink);
                        }
                    }

                    // Method B: Script Variable (window.location / var url)
                    // Agar URL param mein nahi mila, toh script mein dhoondo
                    if (!finalLink) {
                        const scriptMatch = intHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                            intHtml.match(/window\.open\(["']([^"']+)["']\)/i) ||
                                            intHtml.match(/url\s*=\s*["']([^"']+)["']/i) ||
                                            intHtml.match(/domain\s*=\s*["']([^"']+)["']/i);
                        
                        if (scriptMatch && scriptMatch[1]) {
                            finalLink = scriptMatch[1];
                            console.log('✅ Found Direct Link in Script:', finalLink);
                        }
                    }

                    // Method C: Button with ID 'download'
                    if (!finalLink) {
                        const $$ = cheerio.load(intHtml);
                        const btnLink = $$('#download').attr('href') || $$('a.btn').attr('href');
                        if (btnLink && btnLink !== '#' && btnLink.startsWith('http')) {
                            finalLink = btnLink;
                            console.log('✅ Found Direct Link in Button:', finalLink);
                        }
                    }

                    if (finalLink) {
                        streamLinks.push({ server: 'G-Drive Direct', link: finalLink, type: 'mkv' });
                    } else {
                        console.log('⚠️ Failed to extract from Intermediate Page. Dumping URL for manual check:', finalPageUrl);
                        // Fallback: Return original link just in case
                        streamLinks.push({ server: 'Instant Link (Manual)', link: instantBtn, type: 'mkv' });
                    }

                } catch (e) {
                    console.log('❌ Error visiting intermediate page:', e.message);
                }
            } 
            // Case: Old API Token Logic (For other GDFlix domains)
            else if (instantBtn.includes('url=') || instantBtn.includes('id=')) {
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
            // Case: Plain Direct Link
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
