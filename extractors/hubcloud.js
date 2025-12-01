// extractors/hubcloud.js
const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const decode = function (value) {
    if (!value) return '';
    return Buffer.from(value, 'base64').toString('utf-8');
};

async function hubcloudExtracter(link) {
    try {
        console.log('🚀 HubCloud Logic Started for:', link);
        const baseUrl = link.split('/').slice(0, 3).join('/');
        const streamLinks = [];

        // --- Step 1: Get Landing Page ---
        const vLinkRes = await axios.get(link, { headers });
        const vLinkText = vLinkRes.data;
        const $vLink = cheerio.load(vLinkText);

        // Extract Redirect URL
        const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
        let vcloudLink =
            decode(vLinkRedirect[1]?.split('r=')?.[1]) ||
            vLinkRedirect[1] ||
            $vLink('.fa-file-download.fa-lg').parent().attr('href') ||
            link;

        if (vcloudLink?.startsWith('/')) {
            vcloudLink = `${baseUrl}${vcloudLink}`;
        }

        console.log('🔄 Target V-Cloud Link found:', vcloudLink);

        // --- Step 2: Fetch Target Page (CRITICAL UPDATE) ---
        // Yahan hum Headers ke saath 'Referer' bhej rahe hain, jo ki bahut zaroori hai
        const vcloudRes = await axios.get(vcloudLink, {
            headers: {
                ...headers,
                'Referer': link // Ye batata hai ki hum pichle page se aaye hain
            }
        });
        
        const $ = cheerio.load(vcloudRes.data);
        
        // Debugging: Check karo agar title mein "Just a moment" (Cloudflare) hai
        const pageTitle = $('title').text();
        console.log('📄 Target Page Title:', pageTitle);

        // --- Step 3: Parse Buttons ---
        // Selector ko thoda loose rakha hai taaki variations pakad sake
        const linkClass = $('.btn-success, .btn-danger, .btn-secondary, a.btn');
        
        console.log(`🔍 Found ${linkClass.length} potential buttons on page.`);

        const promises = [];

        linkClass.each((i, element) => {
            const itm = $(element);
            let extractedLink = itm.attr('href') || '';
            const btnText = itm.text().trim();

            // Skip invalid links
            if (!extractedLink || extractedLink === '#' || extractedLink.startsWith('javascript')) return;

            console.log(`   ➡️ Processing Button: ${btnText} -> ${extractedLink}`);

            // Logic A: CF Worker / Direct / HubCloud Names
            if (extractedLink?.includes('.dev') || extractedLink?.includes('workers.dev')) {
                streamLinks.push({ server: 'Cf Worker', link: extractedLink, type: 'mkv' });
            }

            // Logic B: PixelDrain
            if (extractedLink?.includes('pixeld')) {
                if (!extractedLink?.includes('api')) {
                    const token = extractedLink.split('/').pop();
                    const pdBase = extractedLink.split('/').slice(0, -2).join('/');
                    extractedLink = `${pdBase}/api/file/${token}?download`;
                }
                streamLinks.push({ server: 'Pixeldrain', link: extractedLink, type: 'mkv' });
            }

            // Logic C: Nested HubCloud Links / Recursive
            if (extractedLink?.includes('hubcloud') || extractedLink?.includes('/?id=')) {
                const p = (async () => {
                    try {
                        const newLinkRes = await axios.head(extractedLink, { 
                            headers: { ...headers, 'Referer': vcloudLink }, // Referer chain maintain karo
                            maxRedirects: 5 
                        });
                        const finalUrl = newLinkRes.request?.res?.responseUrl || extractedLink;
                        
                        // Kabhi kabhi link query param me hota hai 'link=...'
                        const nestedLink = finalUrl.split('link=')?.[1] || finalUrl;
                        
                        // Avoid duplicates or loops
                        if(nestedLink !== vcloudLink) {
                             streamLinks.push({ server: 'HubCloud VIP', link: nestedLink, type: 'mkv' });
                        }
                    } catch (error) {
                        console.log('⚠️ Error resolving nested hubcloud link:', error.message);
                    }
                })();
                promises.push(p);
            }

            // Logic D: Other Sources
            if (extractedLink?.includes('cloudflarestorage')) {
                streamLinks.push({ server: 'CfStorage', link: extractedLink, type: 'mkv' });
            }
            if (extractedLink?.includes('fastdl')) {
                streamLinks.push({ server: 'FastDl', link: extractedLink, type: 'mkv' });
            }
            if (extractedLink.includes('hubcdn')) {
                streamLinks.push({ server: 'HubCdn', link: extractedLink, type: 'mkv' });
            }
        });

        await Promise.all(promises);

        if (streamLinks.length === 0) {
            console.log('⚠️ No streams found. HTML Content Dump (first 500 chars):');
            console.log(vcloudRes.data.substring(0, 500));
        }

        return streamLinks;

    } catch (error) {
        console.error('❌ Extractor Error:', error.message);
        return [];
    }
}

module.exports = hubcloudExtracter;
