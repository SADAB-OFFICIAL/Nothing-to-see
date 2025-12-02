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

            // === A. G-Direct Processing (Works) ===
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

            // === B. M-Cloud Processing (DEBUG MODE) ===
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                const p = (async () => {
                    console.log('☁️ [DEBUG] Found M-Cloud Link:', href);
                    try {
                        const mRes = await axios.get(href, { headers: { ...headers, 'Referer': url } });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        
                        console.log('📄 [DEBUG] M-Cloud Title:', $m('title').text().trim());

                        // --- DEBUGGING THE BUTTON ---
                        console.log('🔍 [DEBUG] Searching for "Generate" button...');
                        
                        // Check 1: Is it a form?
                        const forms = $m('form');
                        console.log(`   - Forms found: ${forms.length}`);
                        forms.each((k, f) => {
                            console.log(`     [Form ${k}] Action: ${$m(f).attr('action')} Method: ${$m(f).attr('method')}`);
                            const inputs = $m(f).find('input');
                            console.log(`     [Form ${k}] Inputs: ${inputs.length}`);
                        });

                        // Check 2: Is it a direct link?
                        const genBtn = $m('a:contains("Generate Download Link")');
                        console.log(`   - Link Buttons found: ${genBtn.length}`);
                        if (genBtn.length > 0) {
                            console.log(`     [Link] Href: ${genBtn.attr('href')}`);
                            console.log(`     [Link] OnClick: ${genBtn.attr('onclick')}`);
                            console.log(`     [Link] ID: ${genBtn.attr('id')}`);
                        }

                        // Check 3: Is it a button tag?
                        const btnTag = $m('button:contains("Generate Download Link")');
                        console.log(`   - <button> Tags found: ${btnTag.length}`);

                        // --- ATTEMPT EXTRACTION BASED ON FINDINGS ---
                        let finalUrl = null;
                        
                        // Logic 1: Form Submit (Existing)
                        if (forms.length > 0) {
                             // ... (Old form logic) ...
                             console.log('   👉 Trying Form Submit logic...');
                             // (Code will be added if form exists)
                        } 
                        // Logic 2: Direct Link
                        else if (genBtn.length > 0 && genBtn.attr('href') && genBtn.attr('href') !== '#') {
                            console.log('   👉 Trying Direct Link logic...');
                            finalUrl = genBtn.attr('href');
                        }
                        // Logic 3: JavaScript Redirect (Regex)
                        else {
                            console.log('   👉 Trying Script logic...');
                             const scriptMatch = mHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) ||
                                                 mHtml.match(/location\.replace\(['"]([^'"]+)['"]\)/);
                             if (scriptMatch) {
                                 finalUrl = scriptMatch[1];
                                 console.log('     Found script redirect:', finalUrl);
                             }
                        }

                        // If we found a URL to follow (GamerXYT)
                        if (finalUrl) {
                            // ... Logic to parse GamerXYT ...
                            console.log('✅ [DEBUG] Following URL:', finalUrl);
                            // (We will add GamerXYT parsing here once we confirm how to get the URL)
                        } else {
                             console.log('❌ [DEBUG] Could not determine next step on M-Cloud.');
                             // Dump HTML part where button should be
                             const bodyHtml = $m('body').html() || '';
                             const btnIndex = bodyHtml.indexOf('Generate Download Link');
                             if (btnIndex !== -1) {
                                 console.log('   HTML Context:', bodyHtml.substring(btnIndex - 100, btnIndex + 200));
                             }
                        }

                    } catch (e) {
                        console.log('❌ M-Cloud Error:', e.message);
                    }
                })();
                promises.push(p);
            }
        });

        await Promise.all(promises);
        
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ NexDrive Global Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
