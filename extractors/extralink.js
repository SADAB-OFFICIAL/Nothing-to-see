const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extralinkExtractor(url) {
    try {
        console.log('🚀 [DEBUG] ExtraLink High Alert Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        const html = res.data;
        let $ = cheerio.load(html);
        
        console.log('📄 [DEBUG] Page Title:', $('title').text().trim());

        // --- 🚨 HIGH ALERT DEBUGGING 🚨 ---
        
        // 1. Check if "Generate Download Link" text exists in raw HTML
        const btnTextIndex = html.indexOf('Generate Download Link');
        
        if (btnTextIndex !== -1) {
            console.log('✅ [DEBUG] "Generate Download Link" text FOUND in HTML!');
            // Dump 300 characters around the button to see the tag structure
            const start = Math.max(0, btnTextIndex - 150);
            const end = Math.min(html.length, btnTextIndex + 150);
            console.log('🔍 [HTML CONTEXT]:', html.substring(start, end));
        } else {
            console.log('❌ [DEBUG] "Generate Download Link" text NOT FOUND in HTML. (Cloudflare/JS Rendering?)');
        }

        // 2. Scan for ANY Form
        const forms = $('form');
        console.log(`🔍 [DEBUG] Forms found: ${forms.length}`);
        forms.each((i, el) => {
            console.log(`   [Form ${i}] Action: ${$(el).attr('action')} | Method: ${$(el).attr('method')}`);
        });

        // 3. Scan for Buttons/Links
        const genBtn = $('a:contains("Generate"), button:contains("Generate"), input[value*="Generate"]');
        console.log(`🔍 [DEBUG] Generate Buttons found via Cheerio: ${genBtn.length}`);
        
        if (genBtn.length > 0) {
            console.log('   Tag:', genBtn.prop('tagName'));
            console.log('   Href:', genBtn.attr('href'));
            console.log('   Onclick:', genBtn.attr('onclick'));
            console.log('   ID:', genBtn.attr('id'));
            console.log('   Class:', genBtn.attr('class'));
        }

        // --- ATTEMPT RECOVERY (Based on common patterns) ---
        
        let finalUrl = null;

        // Strategy A: Direct Link in Href
        if (genBtn.attr('href') && genBtn.attr('href') !== '#') {
            finalUrl = genBtn.attr('href');
            console.log('👉 Strategy A: Found Direct Link');
        }
        
        // Strategy B: Form Submission (Even if inputs missing)
        else if (forms.length > 0) {
            console.log('👉 Strategy B: Trying Form Submit (Blind)...');
            const targetForm = forms.first();
            const action = targetForm.attr('action') || url;
            // Sometimes token is in the action URL itself
            const formData = new URLSearchParams();
            
            // Try grabbing any input we see
            $('input').each((i, el) => {
                const name = $(el).attr('name');
                const val = $(el).attr('value');
                if (name) formData.append(name, val || '');
            });
            
            // Add manual token if inputs failed but we suspect it's needed
            if (!formData.toString()) {
                // Try Regex for token
                const tokenMatch = html.match(/name="([^"]+)"\s+value="([^"]+)"/);
                if (tokenMatch) formData.append(tokenMatch[1], tokenMatch[2]);
            }

            await sleep(2500); // Timer wait

            try {
                const postRes = await axios.post(action, formData, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': url,
                        'Origin': new URL(url).origin,
                        'Cookie': res.headers['set-cookie'] ? res.headers['set-cookie'].join('; ') : ''
                    },
                    maxRedirects: 5
                });
                finalUrl = postRes.request.res.responseUrl;
                console.log('✅ POST Success. Landed on:', finalUrl);
            } catch (e) {
                console.log('❌ POST Failed:', e.message);
            }
        }

        // --- FINAL EXTRACTION (If we reached Page 2) ---
        if (finalUrl) {
            // Hum maan ke chal rahe hain ki hum /s/go/ page par hain
            const finalRes = await axios.get(finalUrl, { headers: { ...headers, 'Referer': url } });
            const finalHtml = finalRes.data;
            const $f = cheerio.load(finalHtml);

            console.log('📄 [DEBUG] Final Page Title:', $f('title').text().trim());

            // Check for Workers link (Screenshot 3 link)
            const scriptMatch = finalHtml.match(/https:\/\/[^"']+\.workers\.dev\/[^"']+/);
            
            if (scriptMatch) {
                console.log('⚡ [SUCCESS] Found Worker Link via Regex:', scriptMatch[0]);
                streamLinks.push({
                    server: 'G-Direct [Instant]',
                    link: scriptMatch[0],
                    type: 'mkv'
                });
            } else {
                 // Try parsing buttons on final page
                 $f('a').each((i, el) => {
                     const href = $(el).attr('href');
                     const text = $(el).text();
                     if (href && (href.includes('workers.dev') || href.includes('drive.google'))) {
                         streamLinks.push({ server: text.trim() || 'Direct Link', link: href, type: 'mkv' });
                     }
                 });
            }
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ ExtraLink Critical Error:', error.message);
        return [];
    }
}

module.exports = extralinkExtractor;
