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

            try {
                // 1. Visit the link (Fast Cloud / Instant Page)
                // Use maxRedirects to follow any jumps
                const subRes = await axios.get(btnLink, { 
                    headers, 
                    maxRedirects: 5 
                });
                const subHtml = subRes.data;
                const $$ = cheerio.load(subHtml);
                const finalPageUrl = subRes.request.res.responseUrl || btnLink;
                
                let finalLink = null;

                // --- STRATEGY A: Check for "CLOUD RESUME DOWNLOAD" (Green Button) ---
                // Ye specifically tumhare naye case (Fast Cloud) ke liye hai
                const resumeCloudBtn = $$('a.btn-success:contains("CLOUD RESUME DOWNLOAD")').attr('href') ||
                                       $$('a.btn-success:contains("Resume Download")').attr('href');

                if (resumeCloudBtn) {
                    console.log(`✅ ${serverName}: Found Cloud Resume Button`);
                    finalLink = resumeCloudBtn;
                }

                // --- STRATEGY B: Check URL Parameters (FastCDN / BusyCDN) ---
                // Agar button nahi mila, toh URL param check karo (?url=...)
                if (!finalLink && finalPageUrl.includes('?url=')) {
                    const extracted = finalPageUrl.split('?url=')[1].split('&')[0];
                    if (extracted) {
                        finalLink = decodeURIComponent(extracted);
                        console.log(`✅ ${serverName}: Found in URL Param`);
                    }
                }

                // --- STRATEGY C: Script Variable (Instant Page JS) ---
                if (!finalLink) {
                    const scriptMatch = subHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                        subHtml.match(/window\.open\(["']([^"']+)["']\)/i) ||
                                        subHtml.match(/url\s*=\s*["']([^"']+)["']/i);
                    if (scriptMatch && scriptMatch[1]) {
                        finalLink = scriptMatch[1];
                        console.log(`✅ ${serverName}: Found in Script`);
                    }
                }

                // --- STRATEGY D: Fallback to Download Here button ---
                if (!finalLink) {
                    const dlBtn = $$('a[id="download"], a:contains("Download Here")').attr('href');
                    if (dlBtn && dlBtn.startsWith('http')) {
                        finalLink = dlBtn;
                    }
                }

                // --- STRATEGY E: API Token (Old GDFlix Logic) ---
                if (!finalLink && (btnLink.includes('url=') || btnLink.includes('id='))) {
                     try {
                        const token = btnLink.split(/url=|id=/)[1]; 
                        const apiUrl = `${baseUrl}/api`;
                        const formData = new URLSearchParams();
                        formData.append('keys', token);

                        const apiRes = await axios.post(apiUrl, formData, {
                            headers: { 'x-token': currentUrl, 'Referer': currentUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
                        });
                        if (apiRes.data && apiRes.data.url) {
                            finalLink = apiRes.data.url;
                            console.log(`✅ ${serverName}: Found via API`);
                        }
                    } catch(err) {}
                }

                // Push whatever we found
                if (finalLink) {
                    streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                } else {
                    // Fallback: If nothing extracted, maybe the link itself is the file or handleable by player
                    // streamLinks.push({ server: serverName + ' (Direct)', link: btnLink, type: 'mkv' });
                }

            } catch (e) {
                console.log(`❌ Error processing ${serverName}:`, e.message);
            }
        };

        // --- TARGETING BUTTONS ---
        
        // 1. Instant DL (Red)
        const instantLink = $('.btn-danger').attr('href');
        if (instantLink) await processButton(instantLink, 'G-Drive Instant');

        // 2. Cloud Download [R2] (Green)
        let r2Link = $('a:contains("Cloud Download")').attr('href') || 
                     $('a:contains("[R2]")').attr('href');
        if (r2Link) await processButton(r2Link, 'Cloud R2');

        // 3. Fast Cloud / Zipdisk (Purple/Others)
        // Ye naya wala hai
        let fastCloudLink = $('a:contains("Fast Cloud")').attr('href') || 
                            $('a:contains("Zipdisk")').attr('href');
        
        if (fastCloudLink) {
            await processButton(fastCloudLink, 'Fast Cloud / Zipdisk');
        }

        // --- STRATEGY 2: Resume/Bot Link (Secondary) ---
        const resumeBtn = $('.btn-secondary, .btn-info').attr('href');
        if (resumeBtn) {
            let botLink = resumeBtn.startsWith('http') ? resumeBtn : `${baseUrl}${resumeBtn}`;
            // Resume links usually require login, adding just in case
            streamLinks.push({ server: 'Resume/Index Cloud', link: botLink, type: 'mkv' });
        }

        // --- STRATEGY 3: Worker Link (Direct on page) ---
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
