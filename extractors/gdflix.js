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

        // --- Helper: Convert PixelDrain View Link to Download Link ---
        const convertPixelDrain = (url) => {
            if (!url) return null;
            // Match /u/ID or /file/ID (Handles .com, .dev, .net)
            const match = url.match(/pixeldrain\.(?:com|dev|net|org)\/(?:u|file)\/([a-zA-Z0-9]+)/);
            if (match && match[1]) {
                return `https://pixeldrain.com/api/file/${match[1]}?download`;
            }
            return null;
        };

        // --- Helper Function to Process Intermediate Links ---
        const processButton = async (btnLink, serverName) => {
            if (!btnLink || btnLink === '#') return;
            
            // Fix Relative URLs
            if (!btnLink.startsWith('http')) {
                btnLink = `${baseUrl}${btnLink.startsWith('/') ? '' : '/'}${btnLink}`;
            }

            // --- SPECIAL CASE 1: Direct PixelDrain Button ---
            const directPd = convertPixelDrain(btnLink);
            if (directPd) {
                console.log(`✅ ${serverName}: Converted to Direct API Link`);
                streamLinks.push({ server: 'PixelDrain', link: directPd, type: 'mkv' });
                return;
            }

            console.log(`🔍 Processing ${serverName}:`, btnLink);

            try {
                // --- CASE 2: ZFile / Fast Cloud ---
                if (btnLink.includes('/zfile/')) {
                    console.log(`⏳ Visiting ZFile Page...`);
                    const zRes = await axios.get(btnLink, { headers });
                    const $z = cheerio.load(zRes.data);

                    const finalLink = $z('a:contains("CLOUD RESUME DOWNLOAD")').attr('href') ||
                                      $z('a:contains("Resume Download")').attr('href') ||
                                      $z('a.btn-success').not('[href="#"]').attr('href');

                    if (finalLink && finalLink.startsWith('http')) {
                        console.log(`✅ ${serverName}: Found Direct Link`);
                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                        return;
                    }
                }

                // --- CASE 3: BusyCDN / FastCDN / Pages.dev ---
                else if (btnLink.includes('busycdn') || btnLink.includes('fastcdn') || btnLink.includes('pages.dev')) {
                    console.log(`⏳ Visiting Intermediate Page...`);
                    const intRes = await axios.get(btnLink, { headers, maxRedirects: 5 });
                    const intHtml = intRes.data;
                    const finalPageUrl = intRes.request.res.responseUrl || btnLink;
                    let finalLink = null;

                    // A. Check if landed on PixelDrain directly
                    const landedPd = convertPixelDrain(finalPageUrl);
                    if (landedPd) {
                        console.log(`✅ ${serverName}: Redirected to PixelDrain`);
                        streamLinks.push({ server: 'PixelDrain', link: landedPd, type: 'mkv' });
                        return;
                    }

                    // B. Check URL Param
                    if (finalPageUrl.includes('?url=')) {
                        const extracted = finalPageUrl.split('?url=')[1].split('&')[0];
                        if (extracted) finalLink = decodeURIComponent(extracted);
                    }

                    // C. Check Script
                    if (!finalLink) {
                        const scriptMatch = intHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                            intHtml.match(/url\s*=\s*["']([^"']+)["']/i);
                        if (scriptMatch) finalLink = scriptMatch[1];
                    }

                    // D. Check Download Button
                    if (!finalLink) {
                        const $$ = cheerio.load(intHtml);
                        const dlBtn = $$('a[id="download"], a:contains("Download Here")').attr('href');
                        if (dlBtn && dlBtn.startsWith('http')) finalLink = dlBtn;
                    }

                    // *** RE-CHECK: If extracted link is PixelDrain ***
                    const extractedPd = convertPixelDrain(finalLink);
                    if (extractedPd) {
                        finalLink = extractedPd;
                        serverName = 'PixelDrain';
                    }

                    if (finalLink) {
                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                    }
                } 
                
                // --- CASE 4: API Token Logic ---
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
                // --- CASE 5: Fallback Direct ---
                else {
                    streamLinks.push({ server: serverName, link: btnLink, type: 'mkv' });
                }

            } catch (e) {
                console.log(`❌ Error processing ${serverName}:`, e.message);
            }
        };

        // --- NEW STRATEGY: SCAN ALL BUTTONS ---
        const buttons = $('a.btn, a.button, a[class*="btn-"]');
        const processedLinks = new Set();
        const promises = [];

        buttons.each((i, el) => {
            const btn = $(el);
            const href = btn.attr('href');
            const text = btn.text().toUpperCase();

            if (!href || href === '#' || href.startsWith('javascript') || processedLinks.has(href)) return;

            processedLinks.add(href);

            let type = null;

            if (text.includes('INSTANT')) type = 'G-Drive Instant';
            else if (text.includes('CLOUD') && text.includes('RESUME')) type = 'Resume Cloud';
            else if (text.includes('CLOUD') && text.includes('R2')) type = 'Cloud R2';
            else if (text.includes('FAST CLOUD') || text.includes('ZIPDISK')) type = 'Fast Cloud';
            else if (text.includes('PIXELDRAIN')) type = 'PixelDrain';
            else if (href.includes('pixeldrain') || href.includes('pixeld')) type = 'PixelDrain'; // Catch by URL
            else if (text.includes('RESUME') || text.includes('BOT')) type = 'Resume/Index Cloud';
            
            if (type) {
                promises.push(processButton(href, type));
            }
        });

        await Promise.all(promises);

        // --- Worker Link Check (Fallback) ---
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('workers.dev') || href.includes('cf-worker'))) {
                if (!streamLinks.some(s => s.link === href)) {
                    streamLinks.push({ server: 'CF Worker', link: href, type: 'mkv' });
                }
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
