const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for Base64 Decoding
const decodeBase64 = (str) => {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch (e) {
        return '';
    }
};

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 [FINAL] NexDrive Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);

        // --- Step 2: Unlock Logic (MobileJSR Client-Side) ---
        const scriptContent = $('script:contains("const encoded =")').html();
        if (scriptContent) {
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            if (match && match[1]) {
                const decodedHtml = decodeBase64(match[1]);
                $ = cheerio.load(decodedHtml);
                console.log('🔓 MobileJSR Decoded Successfully!');
            }
        }

        // --- Step 3: Find & Process Buttons ---
        const promises = [];

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (!href || href === '#' || !href.startsWith('http')) return;

            // ==================================================
            // CASE A: G-Direct [Instant] -> FastDL
            // ==================================================
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                const p = (async () => {
                    console.log('⚡ Processing G-Direct:', href);
                    try {
                        // Visit FastDL Page
                        const fastRes = await axios.get(href, { 
                            headers: { ...headers, 'Referer': url } 
                        });
                        const $$ = cheerio.load(fastRes.data);
                        
                        // Try multiple selectors for the final download button
                        const finalLink = $$('a#download').attr('href') ||               // ID selector
                                          $$('a.btn-success').attr('href') ||            // Class selector
                                          $$('a.btn-primary').attr('href') ||            // Class selector
                                          $$('a:contains("Download Now")').attr('href'); // Text selector
                        
                        if (finalLink && finalLink.startsWith('http')) {
                            console.log('✅ G-Direct Link Extracted:', finalLink);
                            streamLinks.push({ server: 'G-Direct [Instant]', link: finalLink, type: 'mkv' });
                        } else {
                            console.log('⚠️ G-Direct page loaded but no button found.');
                        }
                    } catch (e) {
                        console.log('❌ G-Direct Error:', e.message);
                    }
                })();
                promises.push(p);
            }

            // ==================================================
            // CASE B: M-Cloud [Resumable] -> GamerXYT
            // ==================================================
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ Processing M-Cloud:', href);
                    try {
                        // 1. Visit M-Cloud
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        
                        // 2. Extract JS Redirect (No Form)
                        let finalUrl = null;
                        const scriptMatch = mHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/) || 
                                            mHtml.match(/window\.open\(['"]([^'"]+)['"]\)/) ||
                                            mHtml.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);

                        if (scriptMatch && scriptMatch[1]) {
                            finalUrl = scriptMatch[1];
                        } 

                        // 3. If URL found, Visit GamerXYT
                        if (finalUrl) {
                            const finalRes = await axios.get(finalUrl, { headers: { ...headers, 'Referer': href } });
                            const $f = cheerio.load(finalRes.data);
                            
                            // 4. Extract Links
                            const finalButtons = $f('a.btn, .btn-danger, .btn-success, .btn-primary, .download-link');
                            const innerPromises = [];

                            finalButtons.each((k, btn) => {
                                const bLink = $f(btn).attr('href');
                                let bText = $f(btn).text().trim();
                                
                                if (bLink && bLink.startsWith('http')) {
                                    innerPromises.push((async () => {
                                        bText = bText.replace(/Download|\[|\]/g, '').trim() || 'M-Cloud Server';
                                        let finalLink = bLink;

                                        // Resolve Redirects
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

                                        // PixelDrain
                                        if (finalLink.includes('pixeld')) {
                                            bText = 'PixelDrain';
                                            if (!finalLink.includes('api')) {
                                                const id = finalLink.split('/').pop();
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
                        }
                    } catch (e) {
                        console.log('❌ M-Cloud Error:', e.message);
                    }
                })();
                promises.push(p);
            }
        });

        await Promise.all(promises);
        
        // Remove duplicates
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        // Sort: Put G-Direct first
        uniqueStreams.sort((a, b) => (a.server.includes('G-Direct') ? -1 : 1));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ NexDrive Global Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
