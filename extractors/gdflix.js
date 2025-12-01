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
            if (!btnLink || btnLink === '#') return;
            
            // Fix Relative URLs
            if (!btnLink.startsWith('http')) {
                btnLink = `${baseUrl}${btnLink.startsWith('/') ? '' : '/'}${btnLink}`;
            }

            // --- SPECIAL CASE: PixelDrain Direct Handling ---
            // Agar button ka link seedha pixeldrain hai
            if (btnLink.includes('pixeldrain') || btnLink.includes('pixeld')) {
                console.log(`✅ ${serverName}: Detected Direct PixelDrain Link`);
                const id = btnLink.split('/').pop(); 
                // Convert .dev/.com/u/ to api download link
                const directLink = `https://pixeldrain.com/api/file/${id}?download`;
                streamLinks.push({ server: 'PixelDrain', link: directLink, type: 'mkv' });
                return;
            }

            console.log(`🔍 Processing ${serverName}:`, btnLink);

            try {
                // --- CASE 1: ZFile / Fast Cloud ---
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

                    // *** PIXELDRAIN CHECK AFTER RESOLVE ***
                    if (finalLink && (finalLink.includes('pixeldrain') || finalLink.includes('pixeld'))) {
                        const id = finalLink.split('/').pop();
                        finalLink = `https://pixeldrain.com/api/file/${id}?download`;
                        serverName = 'PixelDrain';
                    }

                    if (finalLink) {
                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                    }
                } 
                
                // --- CASE 3: API Token Logic ---
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
                // --- CASE 4: Fallback Direct ---
                else {
                    streamLinks.push({ server: serverName, link: btnLink, type: 'mkv' });
                }

            } catch (e) {
                console.log(`❌ Error processing ${serverName}:`, e.message);
            }
        };

        // --- NEW STRATEGY: SCAN ALL BUTTONS ---
        // Instead of selecting specific classes, scan all 'a' tags with button classes
        const buttons = $('a.btn, a.button, a[class*="btn-"]');
        
        // Use a Set to avoid processing the same link multiple times
        const processedLinks = new Set();
        const promises = [];

        buttons.each((i, el) => {
            const btn = $(el);
            const href = btn.attr('href');
            const text = btn.text().toUpperCase(); // Case insensitive match

            if (!href || href === '#' || href.startsWith('javascript') || processedLinks.has(href)) return;

            processedLinks.add(href);

            // Determine what this button is
            let type = null;

            if (text.includes('INSTANT')) type = 'G-Drive Instant';
            else if (text.includes('CLOUD') && text.includes('RESUME')) type = 'Resume Cloud'; // Explicit Resume
            else if (text.includes('CLOUD') && text.includes('R2')) type = 'Cloud R2';
            else if (text.includes('FAST CLOUD') || text.includes('ZIPDISK')) type = 'Fast Cloud';
            else if (text.includes('PIXELDRAIN')) type = 'PixelDrain';
            else if (href.includes('pixeldrain') || href.includes('pixeld')) type = 'PixelDrain'; // Check HREF too
            else if (text.includes('RESUME') || text.includes('BOT')) type = 'Resume/Index Cloud';
            
            // If recognized, process it
            if (type) {
                promises.push(processButton(href, type));
            }
        });

        await Promise.all(promises);

        // --- Worker Link Check (Fallback) ---
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('workers.dev') || href.includes('cf-worker'))) {
                // Only add if not already in streamLinks
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
