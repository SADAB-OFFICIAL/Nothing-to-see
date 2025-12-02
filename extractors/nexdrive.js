const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const decodeBase64 = (str) => {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch (e) {
        return '';
    }
};

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 [DEBUG] NexDrive Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);

        // --- Step 2: Unlock Logic ---
        const scriptContent = $('script:contains("const encoded =")').html();
        if (scriptContent) {
            console.log('🔐 [DEBUG] Found Encoded Data. Decoding...');
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                const decodedHtml = decodeBase64(match[1]);
                $ = cheerio.load(decodedHtml);
                console.log('🔓 [DEBUG] Decoded Successfully!');
            }
        }

        // --- Step 3: Find & Process Buttons ---
        const promises = [];

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // === A. G-Direct Processing ===
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                const p = (async () => {
                    console.log('⚡ [DEBUG] Found G-Direct:', href);
                    try {
                        const fastRes = await axios.get(href, { 
                            headers: { ...headers, 'Referer': url } 
                        });
                        const $$ = cheerio.load(fastRes.data);
                        const finalLink = $$('a.btn-primary').attr('href') || 
                                          $$('a:contains("Download Now")').attr('href');
                        
                        if (finalLink) {
                            streamLinks.push({ server: 'G-Direct [Instant]', link: finalLink, type: 'mkv' });
                        }
                    } catch (e) { console.log('❌ G-Direct Error:', e.message); }
                })();
                promises.push(p);
            }

            // === B. M-Cloud Processing (ADVANCED FIX) ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ [DEBUG] Found M-Cloud Link:', href);
                    try {
                        // 1. Initial GET to set cookies and get form data
                        const mRes = await axios.get(href, { 
                            headers: { 
                                ...headers, 
                                'Referer': url // Important for M-Cloud to trust us
                            } 
                        });
                        
                        // Capture Cookies
                        const rawCookies = mRes.headers['set-cookie'];
                        const cookieHeader = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
                        const mHtml = mRes.data;

                        // 2. Regex Input Extraction (More robust than Cheerio)
                        const formData = new URLSearchParams();
                        let inputCount = 0;
                        
                        // Finds all <input name="..." value="..."> even if malformed
                        const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/g;
                        let match;
                        while ((match = inputRegex.exec(mHtml)) !== null) {
                            formData.append(match[1], match[2]);
                            inputCount++;
                        }

                        // Fallback: Try parsing via Cheerio if regex missed something
                        if (inputCount === 0) {
                            const $m = cheerio.load(mHtml);
                            $m('input').each((j, inp) => {
                                const name = $m(inp).attr('name');
                                const val = $m(inp).attr('value');
                                if(name) {
                                    formData.append(name, val || '');
                                    inputCount++;
                                }
                            });
                        }

                        console.log(`🔍 [DEBUG] M-Cloud Inputs Found: ${inputCount}`);

                        if (inputCount > 0) {
                            console.log('⏳ [DEBUG] Waiting 3.5s for M-Cloud Timer...');
                            await sleep(3500);

                            // 3. POST Request (Simulate "Generate Link" click)
                            const mPostRes = await axios.post(href, formData, {
                                headers: {
                                    ...headers,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': href,
                                    'Origin': new URL(href).origin,
                                    'Cookie': cookieHeader // Pass cookies back
                                },
                                maxRedirects: 5
                            });

                            const finalUrl = mPostRes.request.res.responseUrl;
                            console.log('✅ [DEBUG] M-Cloud Post Success. Landed on:', finalUrl);
                            
                            // 4. Parse Final Page (GamerXYT)
                            const $f = cheerio.load(mPostRes.data);
                            
                            // Scan for buttons like FSL, PixelServer, TRS
                            const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary, .download-link');
                            
                            const innerPromises = [];
                            finalButtons.each((k, btn) => {
                                const bLink = $f(btn).attr('href');
                                let bText = $f(btn).text().trim();
                                
                                if (bLink && bLink.startsWith('http')) {
                                    innerPromises.push((async () => {
                                        // Clean Name
                                        bText = bText.replace(/Download|\[|\]/g, '').trim() || 'M-Cloud Server';
                                        let finalLink = bLink;

                                        // Resolve Redirects (Boblover/Hubcloud)
                                        if (bLink.includes('boblover') || bLink.includes('hubcloud') || bLink.includes('vcloud')) {
                                            try {
                                                const headRes = await axios.head(bLink, { 
                                                    headers: { ...headers, 'Referer': finalUrl },
                                                    maxRedirects: 5,
                                                    validateStatus: (s) => s < 400
                                                });
                                                const resolved = headRes.request.res.responseUrl || bLink;
                                                finalLink = resolved.split('link=')?.[1] || resolved;
                                                try { finalLink = decodeURIComponent(finalLink); } catch(e){}
                                            } catch (e) {}
                                        }

                                        // Fix PixelDrain
                                        if (finalLink.includes('pixeld')) {
                                            bText = 'PixelDrain';
                                            const id = finalLink.split('/').pop();
                                            // Ensure it's an API link
                                            if (!finalLink.includes('api')) {
                                                finalLink = `https://pixeldrain.com/api/file/${id}?download`;
                                            }
                                        }

                                        if (!finalLink.includes('t.me')) {
                                            streamLinks.push({ server: bText, link: finalLink, type: 'mkv' });
                                        }
                                    })());
                                }
                            });
                            await Promise.all(innerPromises);
                        } else {
                            // Debugging: If inputs are still 0, dump HTML to see if Cloudflare blocked us
                            console.log('❌ [DEBUG] No Inputs Found on M-Cloud. HTML Dump:', mHtml.substring(0, 200));
                        }

                    } catch (e) {
                        console.log('❌ M-Cloud Critical Error:', e.message);
                    }
                })();
                promises.push(p);
            }
        });

        await Promise.all(promises);
        
        // Remove duplicates
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ NexDrive Global Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
