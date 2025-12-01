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

        // --- Step 2: Fetch Target Page ---
        const vcloudRes = await axios.get(vcloudLink, {
            headers: {
                ...headers,
                'Referer': link 
            }
        });
        
        const $ = cheerio.load(vcloudRes.data);
        const pageTitle = $('title').text();
        console.log('📄 Target Page Title:', pageTitle);

        // --- Step 3: Parse Buttons ---
        const linkClass = $('.btn-success, .btn-danger, .btn-secondary, a.btn');
        console.log(`🔍 Found ${linkClass.length} potential buttons on page.`);

        const promises = [];

        linkClass.each((i, element) => {
            const itm = $(element);
            let extractedLink = itm.attr('href') || '';
            const btnText = itm.text().trim();

            if (!extractedLink || extractedLink === '#' || extractedLink.startsWith('javascript')) return;

            console.log(`   ➡️ Processing Button: ${btnText} -> ${extractedLink}`);

            // 1. Direct Known Patterns
            if (extractedLink?.includes('.dev') || extractedLink?.includes('workers.dev')) {
                streamLinks.push({ server: 'Cf Worker', link: extractedLink, type: 'mkv' });
                return; // Done
            }

            if (extractedLink?.includes('pixeld')) {
                if (!extractedLink?.includes('api')) {
                    const token = extractedLink.split('/').pop();
                    const pdBase = extractedLink.split('/').slice(0, -2).join('/');
                    extractedLink = `${pdBase}/api/file/${token}?download`;
                }
                streamLinks.push({ server: 'Pixeldrain', link: extractedLink, type: 'mkv' });
                return; // Done
            }

            // 2. Resolve Unknown/Redirect Links (Example: boblover.click, hubcloud, etc.)
            // Agar upar match nahi hua, toh hum isse resolve karenge
            const p = (async () => {
                try {
                    const newLinkRes = await axios.head(extractedLink, { 
                        headers: { ...headers, 'Referer': vcloudLink },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 400 // Accept redirects
                    });
                    
                    const finalUrl = newLinkRes.request?.res?.responseUrl || extractedLink;
                    console.log(`      ↳ Resolved: ${finalUrl}`);

                    // Agar final URL nested hubcloud link hai (query param mein)
                    const nestedLink = finalUrl.split('link=')?.[1] || finalUrl;

                    // Final Check on Resolved Link
                    if (nestedLink.includes('.dev') || nestedLink.includes('workers')) {
                        streamLinks.push({ server: 'CF Worker (Resolved)', link: nestedLink, type: 'mkv' });
                    } else if (nestedLink.includes('pixeld')) {
                         // Pixeldrain logic again for resolved link
                         let pdLink = nestedLink;
                         if (!pdLink.includes('api')) {
                            const token = pdLink.split('/').pop();
                            const pdBase = pdLink.split('/').slice(0, -2).join('/');
                            pdLink = `${pdBase}/api/file/${token}?download`;
                         }
                         streamLinks.push({ server: 'Pixeldrain', link: pdLink, type: 'mkv' });
                    } else {
                        // Fallback: Add whatever we found as a stream
                        streamLinks.push({ 
                            server: btnText || 'Cloud Server', 
                            link: nestedLink, 
                            type: 'mkv' 
                        });
                    }

                } catch (error) {
                    console.log(`⚠️ Error resolving link ${extractedLink}:`, error.message);
                    // Agar resolve fail ho jaye, toh original link hi daal do, shayad browser handle kar le
                    streamLinks.push({ 
                        server: btnText || 'Download', 
                        link: extractedLink, 
                        type: 'mkv' 
                    });
                }
            })();
            promises.push(p);
        });

        await Promise.all(promises);

        return streamLinks;

    } catch (error) {
        console.error('❌ Extractor Error:', error.message);
        return [];
    }
}

module.exports = hubcloudExtracter;
