const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Decode Base64 (For client-side unlock)
const decodeBase64 = (str) => {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch (e) {
        return '';
    }
};

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);
        const rawCookies = res.headers['set-cookie'];
        const cookieHeader = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';

        // --- Step 2: Unlock Logic (Hybrid: Form POST or Client-Side Decode) ---
        
        // A. Check for Client-Side Base64 (New MobileJSR Style)
        const scriptContent = $('script:contains("const encoded =")').html();
        if (scriptContent) {
            console.log('🔐 Found Encoded Data (Client-Side). Decoding...');
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                const decodedHtml = decodeBase64(match[1]);
                $ = cheerio.load(decodedHtml);
                console.log('🔓 Decoded Successfully!');
            }
        }
        // B. Check for Server-Side Form (Old Style / Fallback)
        else if ($('form').length > 0) {
            console.log('🔐 Found Locked Form. Attempting POST unlock...');
            const form = $('form').first();
            const formData = new URLSearchParams();
            
            form.find('input').each((i, el) => {
                formData.append($(el).attr('name'), $(el).attr('value') || '');
            });
            
            // Fake button click
            if (!formData.has('unlock')) formData.append('unlock', 'Unlock Download Links');

            await sleep(3500); // Wait logic

            const postRes = await axios.post(url, formData, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': url,
                    'Cookie': cookieHeader
                }
            });
            $ = cheerio.load(postRes.data);
            console.log('🔓 Form Submitted.');
        }

        // --- Step 3: Find & Process Buttons (G-Direct & M-Cloud) ---
        
        const promises = [];

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // === 1. G-Direct Processing ===
            if (text.includes('G-Direct') || text.includes('Instant')) {
                promises.push((async () => {
                    console.log('⚡ Found G-Direct:', href);
                    try {
                        const fastRes = await axios.get(href, { headers: { ...headers, 'Referer': url } });
                        const $$ = cheerio.load(fastRes.data);
                        const finalLink = $$('a.btn-primary').attr('href') || $$('a:contains("Download Now")').attr('href');
                        
                        if (finalLink) {
                            streamLinks.push({ server: 'G-Direct [Instant]', link: finalLink, type: 'mkv' });
                        }
                    } catch (e) { console.log('❌ G-Direct Error:', e.message); }
                })());
            }

            // === 2. M-Cloud Processing ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                promises.push((async () => {
                    console.log('☁️ Found M-Cloud:', href);
                    try {
                        // M-Cloud requires Form Submission (Just like GDFlix logic)
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        const mForm = $m('form');

                        if (mForm.length > 0) {
                            const mFormData = new URLSearchParams();
                            $m('input').each((j, inp) => {
                                mFormData.append($m(inp).attr('name'), $m(inp).attr('value') || '');
                            });

                            console.log('⏳ Waiting for M-Cloud Timer...');
                            await sleep(3500);

                            const mPostRes = await axios.post(href, mFormData, {
                                headers: {
                                    ...headers,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': href
                                }
                            });

                            const finalHtml = mPostRes.data;
                            const $f = cheerio.load(finalHtml);
                            const finalUrl = mPostRes.request.res.responseUrl; // GamerXYT URL

                            // Extract links from GamerXYT Page (FSL, Pixel, etc.)
                            const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary');
                            
                            // Process internal links (Async within M-Cloud)
                            const innerPromises = [];
                            finalButtons.each((k, btn) => {
                                const bLink = $f(btn).attr('href');
                                const bText = $f(btn).text().trim();
                                
                                if (bLink && bLink.startsWith('http')) {
                                    innerPromises.push((async () => {
                                        let name = bText.replace(/Download|\[|\]/g, '').trim() || 'M-Cloud Server';
                                        let cleanLink = bLink;

                                        // Resolve Redirects (Boblover/Hubcloud)
                                        if (bLink.includes('boblover') || bLink.includes('hubcloud') || bLink.includes('vcloud')) {
                                            try {
                                                const headRes = await axios.head(bLink, { 
                                                    headers: { ...headers, 'Referer': finalUrl },
                                                    maxRedirects: 5,
                                                    validateStatus: (s) => s < 400
                                                });
                                                const resolved = headRes.request.res.responseUrl || bLink;
                                                cleanLink = resolved.split('link=')?.[1] || resolved;
                                                try { cleanLink = decodeURIComponent(cleanLink); } catch(e){}
                                            } catch (e) {}
                                        }

                                        // Fix PixelDrain
                                        if (cleanLink.includes('pixeld')) {
                                            name = 'PixelDrain';
                                            if (!cleanLink.includes('api')) {
                                                const id = cleanLink.split('/').pop();
                                                cleanLink = `https://pixeldrain.com/api/file/${id}?download`;
                                            }
                                        }

                                        streamLinks.push({ server: name, link: cleanLink, type: 'mkv' });
                                    })());
                                }
                            });
                            await Promise.all(innerPromises);
                        }
                    } catch (e) { console.log('❌ M-Cloud Error:', e.message); }
                })());
            }
        });

        await Promise.all(promises);
        
        // Remove duplicates
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
