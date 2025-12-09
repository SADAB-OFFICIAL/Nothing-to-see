const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extralinkExtractor(url) {
    try {
        console.log('🚀 [DEBUG] ExtraLink Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load (GET) ---
        const res = await axios.get(url, { headers });
        const html = res.data;
        const $ = cheerio.load(html);

        // Check if page loaded
        console.log('📄 Page Title:', $('title').text().trim());

        // --- Step 2: Handle "Generate Download Link" (Form Parsing) ---
        const formData = new URLSearchParams();
        let inputCount = 0;

        // Scrape ALL hidden inputs
        $('input').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) {
                formData.append(name, value || '');
                inputCount++;
                // console.log(`   Input: ${name} = ${value}`); // Debug inputs
            }
        });

        console.log(`🔍 Found ${inputCount} hidden inputs.`);

        // Agar inputs mile, toh POST request maaro
        if (inputCount > 0) {
            console.log('⏳ Waiting 3 seconds (Timer simulation)...');
            await sleep(3000);

            console.log('🔓 Sending POST request (Generate Link)...');
            
            const postRes = await axios.post(url, formData, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': url,
                    'Origin': new URL(url).origin,
                    'Cookie': res.headers['set-cookie'] ? res.headers['set-cookie'].join('; ') : ''
                },
                maxRedirects: 5 // Follow redirect to /s/go/...
            });

            const finalUrl = postRes.request.res.responseUrl;
            console.log('✅ Redirected to:', finalUrl);

            // --- Step 3: Handle Second Page (Direct Download) ---
            const finalHtml = postRes.data;
            const $f = cheerio.load(finalHtml);

            // Try to find the "Direct Download" button logic
            // ExtraLink aksar ek API call karta hai button click par
            // Hum script mein tokens dhoondhenge
            
            // Logic A: Find explicit links
            const finalLinks = new Set();
            
            $f('a').each((i, el) => {
                const href = $f(el).attr('href');
                const text = $f(el).text().trim();
                
                if (href && href.startsWith('http')) {
                    // Check for worker links or direct file links
                    if (href.includes('workers.dev') || href.includes('googleusercontent') || href.includes('pixeldrain')) {
                        finalLinks.add({ link: href, type: 'Direct' });
                    }
                    // Capture other drive links
                    if (text.includes('Drive') || text.includes('HubCloud') || text.includes('Instant')) {
                         finalLinks.add({ link: href, type: text });
                    }
                }
            });

            // Logic B: Script Variable Extraction (For 'Direct Download' button)
            // Aksar link `var url = '...'` mein hota hai ya `window.open`
            const scriptMatch = finalHtml.match(/window\.open\(['"]([^'"]+)['"]\)/) || 
                                finalHtml.match(/location\.href\s*=\s*['"]([^'"]+)['"]/) ||
                                finalHtml.match(/https:\/\/[^"']+\.workers\.dev\/[^"']+/); // Direct Regex for workers

            if (scriptMatch) {
                const extracted = scriptMatch[1] || scriptMatch[0]; // Regex might return full match at 0
                console.log('⚡ Found Script Link:', extracted);
                finalLinks.add({ link: extracted, type: 'G-Direct [Instant]' });
            }

            // Convert Set to Stream Array
            finalLinks.forEach(item => {
                if (!item.link.includes('t.me') && !item.link.includes('telegram')) {
                    streamLinks.push({
                        server: item.type.replace(/Download|\[|\]/g, '').trim() || 'ExtraLink Server',
                        link: item.link,
                        type: 'mkv'
                    });
                }
            });

            // Special Check: Agar "Direct Download" button HTML mein hai par link JS se ban raha hai
            // Hum page ka Token nikaal kar manual API call try kar sakte hain (Advanced)
            // Filhal Script Regex (Logic B) usually kaam kar jata hai.

        } else {
            console.log('❌ No inputs found. Page structure changed or Cloudflare blocked.');
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ ExtraLink Error:', error.message);
        return [];
    }
}

module.exports = extralinkExtractor;
