const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 [DEBUG MODE] NexDrive Logic Started for:', url);
        const streamLinks = [];

        // --- Step 1: Initial Page Load ---
        const res = await axios.get(url, { headers });
        const html = res.data;
        let $ = cheerio.load(html);
        
        console.log('📄 Page Title:', $('title').text().trim());

        // --- 🚨 HIGH ALERT DEBUGGING SYSTEM 🚨 ---
        console.log('-------- DEBUG START --------');
        
        // 1. Check if "Unlock" word exists
        const hasUnlock = html.toLowerCase().includes('unlock');
        console.log(`🔍 Contains "Unlock" text? ${hasUnlock ? 'YES' : 'NO'}`);

        if (hasUnlock) {
            // Find exactly which tag contains "Unlock"
            const unlockTags = [];
            $('*').each((i, el) => {
                const text = $(el).text().trim();
                const val = $(el).val();
                if ((text === 'Unlock Download Links' || text.includes('Unlock')) && $(el).children().length === 0) {
                    unlockTags.push({
                        tag: el.tagName,
                        text: text,
                        class: $(el).attr('class'),
                        id: $(el).attr('id'),
                        type: $(el).attr('type'),
                        name: $(el).attr('name'),
                        parent: $(el).parent().prop('tagName')
                    });
                }
                if (val && typeof val === 'string' && val.includes('Unlock')) {
                     unlockTags.push({ tag: 'input/btn', type: $(el).attr('type'), name: $(el).attr('name') });
                }
            });
            console.log('🔍 Unlock Elements Found:', JSON.stringify(unlockTags, null, 2));
        }

        // 2. Dump all Forms and Inputs
        const forms = $('form');
        console.log(`🔍 Total Forms Found: ${forms.length}`);
        
        forms.each((i, el) => {
            console.log(`   [Form ${i}] Action: ${$(el).attr('action')} | Method: ${$(el).attr('method')}`);
            const inputs = $(el).find('input');
            console.log(`   [Form ${i}] Inputs: ${inputs.length}`);
            inputs.each((j, inp) => {
                console.log(`      - Input: name="${$(inp).attr('name')}" value="${$(inp).attr('value')}" type="${$(inp).attr('type')}"`);
            });
        });

        console.log('-------- DEBUG END --------');

        // --- ATTEMPT RECOVERY (Blind Logic) ---
        // Agar form detect nahi hua, tab bhi hum try karenge (Standard WP Protection Logic)
        
        console.log('⚠️ Attempting blind unlock...');
        
        const formData = new URLSearchParams();
        let foundInputs = false;

        // Try to find ANY inputs on the page, regardless of form
        $('input').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name) {
                formData.append(name, value || '');
                foundInputs = true;
            }
        });

        // Add typical Unlock keys manually if missing
        if (!formData.has('unlock')) formData.append('unlock', 'Unlock Download Links');
        
        // Timer
        await sleep(3500);

        console.log(`🔓 Sending POST (Inputs found: ${foundInputs})...`);
        
        const postRes = await axios.post(url, formData, {
            headers: {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': url,
                'Origin': new URL(url).origin,
                'Cookie': res.headers['set-cookie'] ? res.headers['set-cookie'].join('; ') : ''
            }
        });

        $ = cheerio.load(postRes.data);
        console.log('📄 Post-Unlock Page Title:', $('title').text().trim());

        // --- Step 3: Find Links ---
        // Specific selector for the screenshot you showed
        let fastDlLink = null;
        
        // Check for "G-Direct" specific text
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            if (href && (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl'))) {
                console.log(`✅ Found Potential Link: ${text} -> ${href}`);
                fastDlLink = href;
            }
        });

        if (fastDlLink) {
            // --- Step 4: Visit FastDL ---
            const fastRes = await axios.get(fastDlLink, { headers: { ...headers, 'Referer': url } });
            const $$ = cheerio.load(fastRes.data);
            
            const finalLink = $$('a:contains("Download Now")').attr('href') || 
                              $$('a.btn-primary').attr('href');

            if (finalLink) {
                streamLinks.push({ server: 'G-Direct [Instant]', link: finalLink, type: 'mkv' });
            }
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ NexDrive Error:', error.message);
        // Log response data if available to see server error
        if (error.response) console.log('Server Response:', error.response.status);
        return [];
    }
}

module.exports = nexdriveExtractor;
