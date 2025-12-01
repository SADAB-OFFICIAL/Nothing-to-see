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
            
            // Fix Relative URLs
            if (!btnLink.startsWith('http')) {
                btnLink = `${baseUrl}${btnLink.startsWith('/') ? '' : '/'}${btnLink}`;
            }

            console.log(`🔍 Processing ${serverName}:`, btnLink);

            try {
                // --- CASE 1: ZFile / Fast Cloud (/zfile/) ---
                if (btnLink.includes('/zfile/')) {
                    console.log(`⏳ Visiting ZFile Page...`);
                    const zRes = await axios.get(btnLink, { headers });
                    const $z = cheerio.load(zRes.data);

                    // Target the Green "CLOUD RESUME DOWNLOAD" Button
                    const finalLink = $z('a:contains("CLOUD RESUME DOWNLOAD")').attr('href') ||
                                      $z('a:contains("Resume Download")').attr('href') ||
                                      $z('a.btn-success').not('[href="#"]').attr('href'); // Fallback to any green button

                    if (finalLink && finalLink.startsWith('http')) {
                        console.log(`✅ ${serverName}: Found Direct Link:`, finalLink);
                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                        return; // Done
                    } else {
                        console.log(`⚠️ ${serverName}: Button not found on ZFile page.`);
                    }
                }

                // --- CASE 2: BusyCDN / FastCDN / Pages.dev ---
                else if (btnLink.includes('busycdn') || btnLink.includes('fastcdn') || btnLink.includes('pages.dev')) {
                    console.log(`⏳ Visiting Intermediate Page...`);
                    const intRes = await axios.get(btnLink, { headers, maxRedirects: 5 });
                    const intHtml = intRes.data;
                    const finalPageUrl = intRes.request.res.responseUrl || btnLink;
                    let finalLink = null;

                    // A. Check URL Param
                    if (finalPageUrl.includes('?url=')) {
                        const extracted = finalPageUrl.split('?url=')[1].split('&')[0];
                        if (extracted) finalLink = decodeURIComponent(extracted);
                    }

                    // B. Check Script
                    if (!finalLink) {
                        const scriptMatch = intHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                            intHtml.match(/url\s*=\s*["']([^"']+)["']/i);
                        if (scriptMatch) finalLink = scriptMatch[1];
                    }

                    // C. Check Download Button
                    if (!finalLink) {
                        const $$ = cheerio.load(intHtml);
                        const dlBtn = $$('a[id="download"], a:contains("Download Here")').attr('href');
                        if (dlBtn && dlBtn.startsWith('http')) finalLink = dlBtn;
                    }

                    if (finalLink) {
                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                    }
                } 
                
                // --- CASE 3: Standard API Token Logic ---
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
                
                // --- CASE 4: Direct Link Fallback ---
                else {
                    streamLinks.push({ server: serverName, link: btnLink, type: 'mkv' });
                }

            } catch (e) {
                console.log(`❌ Error processing ${serverName}:`, e.message);
            }
        };

        // --- TARGETING BUTTONS ---
        
        // 1. Instant DL
        const instantLink = $('.btn-danger').attr('href');
        if (instantLink) await processButton(instantLink, 'G-Drive Instant');

        // 2. Cloud Download [R2]
        let r2Link = $('a:contains("Cloud Download")').attr('href') || $('a:contains("[R2]")').attr('href');
        if (r2Link) await processButton(r2Link, 'Cloud R2');

        // 3. Fast Cloud / Zipdisk (The one you asked for)
        let fastCloudLink = $('a:contains("Fast Cloud")').attr('href') || 
                            $('a:contains("Zipdisk")').attr('href');
        
        if (fastCloudLink) {
            await processButton(fastCloudLink, 'Fast Cloud / Zipdisk');
        }

        // --- Resume/Bot Link ---
        const resumeBtn = $('.btn-secondary, .btn-info').attr('href');
        if (resumeBtn && !resumeBtn.includes('javascript')) {
            let botLink = resumeBtn.startsWith('http') ? resumeBtn : `${baseUrl}${resumeBtn}`;
            // If it's a zfile link, process it properly instead of just pushing
            if (botLink.includes('/zfile/')) {
                 await processButton(botLink, 'Resume Cloud');
            } else {
                 streamLinks.push({ server: 'Resume/Index Cloud', link: botLink, type: 'mkv' });
            }
        }

        // --- Worker Link ---
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('workers.dev') || href.includes('cf-worker'))) {
                streamLinks.push({ server: 'CF Worker', link: href, type: 'mkv' });
            }
        });

        // Deduplicate
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ GDFlix Error:', error.message);
        return [];
    }
}

module.exports = gdFlixExtracter;
