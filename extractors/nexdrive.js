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

            // === A. G-Direct Processing (Already Working) ===
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                const p = (async () => {
                    console.log('⚡ [DEBUG] Found G-Direct:', href);
                    try {
                        const fastRes = await axios.get(href, { headers: { ...headers, 'Referer': url } });
                        const $$ = cheerio.load(fastRes.data);
                        const finalLink = $$('a.btn-primary').attr('href') || $$('a:contains("Download Now")').attr('href');
                        
                        if (finalLink) {
                            streamLinks.push({ server: 'G-Direct [Instant]', link: finalLink, type: 'mkv' });
                        }
                    } catch (e) { console.log('❌ G-Direct Error:', e.message); }
                })();
                promises.push(p);
            }

            // === B. M-Cloud Processing (FIXED LOGIC) ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ [DEBUG] Found M-Cloud Link:', href);
                    try {
                        // 1. Visit M-Cloud Page
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        
                        // 2. Find Inputs (Without relying on <form> tag)
                        const formData = new URLSearchParams();
                        let inputCount = 0;

                        $m('input').each((j, inp) => {
                            const name = $m(inp).attr('name');
                            const val = $m(inp).attr('value');
                            if(name) {
                                formData.append(name, val || '');
                                inputCount++;
                            }
                        });

                        console.log(`🔍 [DEBUG] M-Cloud Inputs Found: ${inputCount}`);

                        // Wait Timer
                        console.log('⏳ [DEBUG] Waiting 3.5s for M-Cloud Timer...');
                        await sleep(3500); 

                        // 3. Submit POST (Generate Link)
                        // Note: Using current URL (href) as action
                        const mPostRes = await axios.post(href, formData, {
                            headers: {
                                ...headers,
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': href,
                                'Origin': new URL(href).origin
                            }
                        });

                        const finalUrl = mPostRes.request.res.responseUrl; 
                        console.log('✅ [DEBUG] M-Cloud Post Success. Landed on:', finalUrl);
                        
                        // 4. Parse GamerXYT Page (The Landing Page)
                        const $f = cheerio.load(mPostRes.data);
                        
                        // Get all potential download buttons
                        const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary, .download-link');
                        const innerPromises = [];

                        finalButtons.each((k, btn) => {
                            const bLink = $f(btn).attr('href');
                            let bText = $f(btn).text().trim();
                            
                            // Clean Server Name
                            bText = bText.replace(/Download|\[|\]|Server|:| /g, ' ').trim();
                            if(!bText) bText = 'Cloud Server';

                            if (bLink && bLink.startsWith('http')) {
                                innerPromises.push((async () => {
                                    let finalLink = bLink;
                                    let serverName = bText;

                                    // Resolve Redirects (Boblover/Hubcloud/Vcloud)
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

                                    // Fix PixelDrain Links
                                    if (finalLink.includes('pixeld')) {
                                        serverName = 'PixelDrain';
                                        if (!finalLink.includes('api')) {
                                            const id = finalLink.split('/').pop();
                                            finalLink = `https://pixeldrain.com/api/file/${id}?download`;
                                        }
                                    }

                                    // Filter Junk
                                    if (!finalLink.includes('t.me') && !finalLink.includes('telegram')) {
                                        streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                                    }
                                })());
                            }
                        });
                        
                        await Promise.all(innerPromises);

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
