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

        // Handle JS Redirect
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

        // --- Helper Function to Process Intermediate Links ---
        const processButton = async (btnLink, serverName) => {
            if (!btnLink) return;
            console.log(`🔍 Processing ${serverName}:`, btnLink);

            // Case A: BusyCDN / FastCDN / Intermediate Pages (Jo screenshot mein hai)
            if (btnLink.includes('busycdn') || btnLink.includes('fastcdn') || btnLink.includes('pages.dev')) {
                try {
                    console.log(`⏳ Visiting Intermediate Page for ${serverName}...`);
                    
                    const intRes = await axios.get(btnLink, { 
                        headers,
                        maxRedirects: 5 
                    });
                    
                    const intHtml = intRes.data;
                    const finalPageUrl = intRes.request.res.responseUrl || btnLink;
                    let finalLink = null;

                    // 1. Check URL Params (?url=...) - Most reliable
                    if (finalPageUrl.includes('?url=')) {
                        const extracted = finalPageUrl.split('?url=')[1].split('&')[0];
                        if (extracted) {
                            finalLink = decodeURIComponent(extracted);
                            console.log(`✅ ${serverName}: Found in URL Param`);
                        }
                    }

                    // 2. Check Script (window.location)
                    if (!finalLink) {
                        const scriptMatch = intHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                            intHtml.match(/window\.open\(["']([^"']+)["']\)/i) ||
                                            intHtml.match(/url\s*=\s*["']([^"']+)["']/i);
                        if (scriptMatch && scriptMatch[1]) {
                            finalLink = scriptMatch[1];
                            console.log(`✅ ${serverName}: Found in Script`);
                        }
                    }

                    // 3. Check Download Button
                    if (!finalLink) {
                        const $$ = cheerio.load(intHtml);
                        const dlBtn = $$('a[id="download"], a.btn-primary, a:contains("Download Here")').attr('href');
                        if (dlBtn && dlBtn.startsWith('http')) {
                            finalLink = dlBtn;
                            console.log(`✅ ${serverName}: Found in HTML Button`);
                        }
                    }

                    if (finalLink) {
                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                    }

                } catch (e) {
                    console.log(`❌ Error processing ${serverName}:`, e.message);
                }
            } 
            // Case B: Old API Token Logic
            else if (btnLink.includes('url=') || btnLink.includes('id=')) {
                try {
                    const token = btnLink.split(/url=|id=/)[1]; 
                    const apiUrl = `${baseUrl}/api`;
                    const formData = new URLSearchParams();
                    formData.append('keys', token);

                    const apiRes = await axios.post(apiUrl, formData, {
                        headers: { 'x-token': currentUrl, 'Referer': currentUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    if (apiRes.data && apiRes.data.url) {
                        streamLinks.push({ server: serverName, link: apiRes.data.url, type: 'mkv' });
                    }
                } catch(err) {}
            }
            // Case C: Direct Link
            else {
                streamLinks.push({ server: serverName, link: btnLink, type: 'mkv' });
            }
        };

        // --- STRATEGY: Target Multiple Buttons ---
        
        // 1. Instant DL (Red Button)
        const instantLink = $('.btn-danger').attr('href');
        if (instantLink) await processButton(instantLink, 'G-Drive Instant');

        // 2. Cloud Download [R2] (Green/Success Button or Text match)
        // Screenshot mein ye 'Cloud Download [R2]' hai
        let r2Link = $('a:contains("Cloud Download")').attr('href') || 
                     $('a:contains("[R2]")').attr('href');
        
        // Fallback: kabhi kabhi class alag hoti hai
        if (!r2Link) r2Link = $('.btn-success').not(':contains("Login")').attr('href');
        
        if (r2Link) await processButton(r2Link, 'Cloud R2');

        // 3. Fast Cloud / Zipdisk (Purple Button)
        let fastCloudLink = $('a:contains("Fast Cloud")').attr('href') || 
                            $('a:contains("Zipdisk")').attr('href');
        if (fastCloudLink) await processButton(fastCloudLink, 'Fast Cloud');


        // --- STRATEGY 2: Resume/Bot Link ---
        const resumeBtn = $('.btn-secondary, .btn-info').attr('href');
        if (resumeBtn) {
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

        // Final Deduplication
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ GDFlix Error:', error.message);
        return [];
    }
}

module.exports = gdFlixExtracter;
