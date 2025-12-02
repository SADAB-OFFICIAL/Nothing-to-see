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

            // === A. G-Direct Processing (Working) ===
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                const p = (async () => {
                    console.log('⚡ [DEBUG] Found G-Direct:', href);
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
                    } catch (e) { console.log('❌ G-Direct Error:', e.message); }
                })();
                promises.push(p);
            }

            // === B. M-Cloud Processing (The Problem Area) ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ [DEBUG] Found M-Cloud Link:', href);
                    try {
                        // 1. Visit M-Cloud Page
                        console.log('⏳ [DEBUG] Visiting M-Cloud Page...');
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        
                        // DEBUG: Check what we loaded
                        const pageTitle = $m('title').text().trim();
                        console.log('📄 [DEBUG] M-Cloud Page Title:', pageTitle);

                        // 2. Find Form
                        const form = $m('form');
                        console.log(`🔍 [DEBUG] Forms found on M-Cloud: ${form.length}`);

                        if (form.length === 0) {
                            console.log('❌ [DEBUG] No Form Found! HTML Dump (First 500 chars):');
                            console.log(mHtml.substring(0, 500));
                            return;
                        }

                        const formData = new URLSearchParams();
                        $m('input').each((j, inp) => {
                            const name = $m(inp).attr('name');
                            const val = $m(inp).attr('value');
                            if(name) {
                                formData.append(name, val || '');
                                console.log(`   [Input] ${name} = ${val}`);
                            }
                        });

                        console.log('⏳ [DEBUG] Waiting 4 seconds (Timer)...');
                        await sleep(4000); 

                        // 3. Submit Form
                        console.log('🚀 [DEBUG] Submitting M-Cloud POST...');
                        const mPostRes = await axios.post(href, formData, {
                            headers: {
                                ...headers,
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Referer': href,
                                'Origin': new URL(href).origin
                            }
                        });

                        const finalHtml = mPostRes.data;
                        const $f = cheerio.load(finalHtml);
                        const finalUrl = mPostRes.request.res.responseUrl; 
                        
                        console.log('✅ [DEBUG] M-Cloud Post Success. Landed on:', finalUrl);
                        
                        // DEBUG: Check title of landed page
                        console.log('📄 [DEBUG] Landed Page Title:', $f('title').text().trim());

                        // 4. Extract Links
                        const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary, .download-link');
                        console.log(`🔍 [DEBUG] Buttons found on final page: ${finalButtons.length}`);

                        const innerPromises = [];
                        finalButtons.each((k, btn) => {
                            const bLink = $f(btn).attr('href');
                            let bText = $f(btn).text().trim();
                            
                            console.log(`   ➡️ Button found: "${bText}" -> ${bLink}`);

                            if (bLink && bLink.startsWith('http')) {
                                innerPromises.push((async () => {
                                    // Helper for nested resolution (Boblover/Hubcloud)
                                    if (bLink.includes('boblover') || bLink.includes('hubcloud') || bLink.includes('vcloud')) {
                                        console.log(`      ↳ Resolving redirect for: ${bText}`);
                                        try {
                                            const headRes = await axios.head(bLink, { 
                                                headers: { ...headers, 'Referer': finalUrl },
                                                maxRedirects: 5,
                                                validateStatus: (s) => s < 400
                                            });
                                            const resolved = headRes.request.res.responseUrl || bLink;
                                            
                                            // Extract nested link param if exists
                                            let cleanUrl = resolved.split('link=')?.[1] || resolved;
                                            try { cleanUrl = decodeURIComponent(cleanUrl); } catch(e){}
                                            
                                            console.log(`      ✅ Resolved to: ${cleanUrl}`);
                                            
                                            let serverName = bText.replace(/Download|\[|\]/g, '').trim() || 'M-Cloud Server';
                                            if (cleanUrl.includes('pixeld')) serverName = 'PixelDrain';

                                            if (cleanUrl.includes('pixeld') && !cleanUrl.includes('api')) {
                                                const id = cleanUrl.split('/').pop();
                                                cleanUrl = `https://pixeldrain.com/api/file/${id}?download`;
                                            }

                                            streamLinks.push({ server: serverName, link: cleanUrl, type: 'mkv' });
                                        } catch (e) { console.log(`      ❌ Resolve failed: ${e.message}`); }
                                    } 
                                    // Direct Links (PixelServer etc)
                                    else {
                                        let serverName = bText.replace(/Download|\[|\]/g, '').trim() || 'M-Cloud Server';
                                        if (bLink.includes('pixeld')) {
                                            const id = bLink.split('/').pop();
                                            const pdLink = `https://pixeldrain.com/api/file/${id}?download`;
                                            streamLinks.push({ server: 'PixelDrain', link: pdLink, type: 'mkv' });
                                        } else {
                                            streamLinks.push({ server: serverName, link: bLink, type: 'mkv' });
                                        }
                                    }
                                })());
                            }
                        });
                        
                        await Promise.all(innerPromises);

                    } catch (e) {
                        console.log('❌ M-Cloud Critical Error:', e.message);
                        if (e.response) console.log('   Status Code:', e.response.status);
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
