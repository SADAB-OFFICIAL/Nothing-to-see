const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

// Helper for Sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for Base64 Decode
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

        // --- Step 2: Client-Side Unlock (Base64) ---
        const scriptContent = $('script:contains("const encoded =")').html();
        if (scriptContent) {
            console.log('🔐 Found Encoded Data. Decoding...');
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                const decodedHtml = decodeBase64(match[1]);
                $ = cheerio.load(decodedHtml); // Update Cheerio with unlocked content
                console.log('🔓 Decoded Successfully!');
            }
        }

        // --- Step 3: Find & Process ALL Buttons ---
        const promises = [];

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // === A. Process G-Direct [Instant] ===
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                const p = (async () => {
                    console.log('⚡ Found G-Direct:', href);
                    try {
                        const fastRes = await axios.get(href, { 
                            headers: { ...headers, 'Referer': url } 
                        });
                        const $$ = cheerio.load(fastRes.data);
                        const finalLink = $$('a.btn-primary').attr('href') || 
                                          $$('a:contains("Download Now")').attr('href') ||
                                          $$('a[href*="googleusercontent"]').attr('href');
                        
                        if (finalLink) {
                            streamLinks.push({ server: 'G-Direct [Instant]', link: finalLink, type: 'mkv' });
                        }
                    } catch (e) {
                        console.log('❌ G-Direct Error:', e.message);
                    }
                })();
                promises.push(p);
            }

            // === B. Process M-Cloud [Resumable] ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ Found M-Cloud:', href);
                    try {
                        // 1. Visit M-Cloud Page
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        
                        // 2. Find Form to Generate Link
                        const form = $m('form');
                        if (form.length > 0) {
                            const formData = new URLSearchParams();
                            $m('input').each((j, inp) => {
                                formData.append($m(inp).attr('name'), $m(inp).attr('value') || '');
                            });

                            console.log('⏳ M-Cloud: Waiting for timer...');
                            await sleep(3500); // Wait logic

                            // 3. Submit Form (POST) -> Redirects to GamerXYT
                            const mPostRes = await axios.post(href, formData, {
                                headers: {
                                    ...headers,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': href
                                }
                            });

                            const finalHtml = mPostRes.data;
                            const $f = cheerio.load(finalHtml);
                            const finalUrl = mPostRes.request.res.responseUrl; // e.g. gamerxyt.lat
                            
                            console.log('✅ M-Cloud unlocked. Scaping final page:', finalUrl);

                            // 4. Extract Links from GamerXYT (FSL, Pixel, TRS)
                            // We reuse the logic from HubCloud extractor here slightly
                            const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary, .download-link');
                            
                            const innerPromises = [];
                            
                            finalButtons.each((k, btn) => {
                                const bLink = $f(btn).attr('href');
                                let bText = $f(btn).text().trim();
                                
                                if (bLink && bLink.startsWith('http')) {
                                    // Clean Name
                                    bText = bText.replace(/Download|\[|\]/g, '').trim() || 'M-Cloud Server';

                                    const innerP = (async () => {
                                        let finalLink = bLink;
                                        
                                        // Resolve Redirects (hubcloud/boblover/vcloud)
                                        if (bLink.includes('boblover') || bLink.includes('hubcloud') || bLink.includes('vcloud')) {
                                            try {
                                                const headRes = await axios.head(bLink, { 
                                                    headers: { ...headers, 'Referer': finalUrl },
                                                    maxRedirects: 5,
                                                    validateStatus: (s) => s < 400
                                                });
                                                const resolved = headRes.request.res.responseUrl || bLink;
                                                // Extract nested link param if exists
                                                finalLink = resolved.split('link=')?.[1] || resolved;
                                                try { finalLink = decodeURIComponent(finalLink); } catch(e){}
                                            } catch (e) {
                                                // If head fails, keep original link
                                            }
                                        }

                                        // Fix PixelDrain (Convert view to api)
                                        if (finalLink.includes('pixeld')) {
                                            bText = 'PixelDrain';
                                            if (!finalLink.includes('api')) {
                                                const id = finalLink.split('/').pop();
                                                finalLink = `https://pixeldrain.com/api/file/${id}?download`;
                                            }
                                        }

                                        // Filter junk
                                        if (!finalLink.includes('t.me')) {
                                            streamLinks.push({ server: bText, link: finalLink, type: 'mkv' });
                                        }
                                    })();
                                    innerPromises.push(innerP);
                                }
                            });
                            await Promise.all(innerPromises);
                        }
                    } catch (e) {
                        console.log('❌ M-Cloud Processing Error:', e.message);
                    }
                })();
                promises.push(p);
            }
        });

        // Wait for ALL buttons to be processed
        await Promise.all(promises);

        return streamLinks;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
