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
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                const decodedHtml = decodeBase64(match[1]);
                $ = cheerio.load(decodedHtml);
                console.log('🔓 [DEBUG] MobileJSR Decoded Successfully!');
            }
        }

        // --- Step 3: Find & Process Buttons ---
        const promises = [];
        const processed = new Set();

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;
            if (processed.has(href)) return;
            processed.add(href);

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

            // === B. M-Cloud Processing ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ [DEBUG] Found M-Cloud Link:', href);
                    try {
                        // 1. Visit M-Cloud Page
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        
                        // 2. Find Inputs
                        const formData = new URLSearchParams();
                        let inputCount = 0;
                        const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/g;
                        let match;
                        while ((match = inputRegex.exec(mHtml)) !== null) {
                            formData.append(match[1], match[2]);
                            inputCount++;
                        }

                        if (inputCount > 0) {
                            console.log('⏳ Waiting 3.5s for M-Cloud Timer...');
                            await sleep(3500); 

                            // 3. Submit POST
                            const mPostRes = await axios.post(href, formData, {
                                headers: {
                                    ...headers,
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': href,
                                    'Origin': new URL(href).origin,
                                    'Cookie': mRes.headers['set-cookie'] ? mRes.headers['set-cookie'].join('; ') : ''
                                },
                                maxRedirects: 5
                            });

                            const finalUrl = mPostRes.request.res.responseUrl; 
                            console.log('✅ M-Cloud Unlocked. Parsing GamerXYT...');
                            
                            // 4. Extract Links from GamerXYT
                            const $f = cheerio.load(mPostRes.data);
                            const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary, .download-link');
                            
                            const innerPromises = [];
                            
                            finalButtons.each((k, btn) => {
                                const bLink = $f(btn).attr('href');
                                let bText = $f(btn).text().trim();
                                
                                if (bLink && bLink.startsWith('http')) {
                                    innerPromises.push((async () => {
                                        // Clean Name
                                        bText = bText.replace(/Download|\[|\]|Server|:| /g, ' ').trim() || 'M-Cloud Server';
                                        let finalLink = bLink;

                                        // --- FIX: 10Gbps / HubCDN Resolver ---
                                        if (bText.includes('10Gbps') || bLink.includes('hubcdn') || bLink.includes('carnewz')) {
                                            try {
                                                const hubRes = await axios.get(bLink, { 
                                                    headers: { ...headers, 'Referer': finalUrl },
                                                    maxRedirects: 5
                                                });
                                                const hubHtml = hubRes.data;
                                                const hubFinalUrl = hubRes.request.res.responseUrl;

                                                if (hubFinalUrl.includes('?url=')) {
                                                    finalLink = decodeURIComponent(hubFinalUrl.split('?url=')[1].split('&')[0]);
                                                } else {
                                                    const googleRegex = /https:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>;)]+/g;
                                                    const matches = hubHtml.match(googleRegex);
                                                    if (matches && matches.length > 0) {
                                                         finalLink = matches.reduce((a, b) => a.length > b.length ? a : b).replace(/\\/g, '');
                                                    }
                                                }
                                                bText = 'Server : 10Gbps';
                                            } catch(err) {
                                                console.log('HubCDN Error:', err.message);
                                            }
                                        }

                                        // --- Standard Redirects ---
                                        else if (bLink.includes('boblover') || bLink.includes('hubcloud') || bLink.includes('vcloud')) {
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

                                        // --- PixelDrain Fix ---
                                        if (finalLink.includes('pixeld')) {
                                            bText = 'PixelDrain';
                                            if (!finalLink.includes('api')) {
                                                const id = finalLink.split('/').pop();
                                                finalLink = `https://pixeldrain.com/api/file/${id}?download`;
                                            }
                                        }

                                        // Junk Filter
                                        if (!finalLink.includes('t.me') && !finalLink.includes('telegram')) {
                                            streamLinks.push({ server: bText, link: finalLink, type: 'mkv' });
                                        }
                                    })());
                                }
                            });
                            await Promise.all(innerPromises);
                        }

                    } catch (e) {
                        console.log('❌ M-Cloud Critical Error:', e.message);
                    }
                })();
                promises.push(p);
            }
        });

        await Promise.all(promises);
        
        // Final Deduplication
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));
        
        // Sort
        uniqueStreams.sort((a, b) => {
            if (a.server.includes('10Gbps')) return -1;
            if (a.server.includes('G-Direct')) return -1;
            return 0;
        });

        return uniqueStreams;

    } catch (error) {
        console.error('❌ NexDrive Global Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
