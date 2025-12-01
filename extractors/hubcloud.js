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

        // --- Step 3: Parse Buttons (Improved Selector) ---
        // Ab hum div wrapper ke andar ke 'a' tags ko bhi target karenge
        const linkElements = $('.btn-success, .btn-danger, .btn-secondary, a.btn, .download-link');
        console.log(`🔍 Found ${linkElements.length} potential buttons on page.`);

        const promises = [];

        linkElements.each((i, element) => {
            const itm = $(element);
            const btnText = itm.text().trim();
            
            // Priority 1: Href
            let extractedLink = itm.attr('href');

            // Priority 2: Onclick (Agar href bekaar hai)
            if (!extractedLink || extractedLink === '#' || extractedLink.startsWith('javascript')) {
                const onClick = itm.attr('onclick');
                if (onClick) {
                    // Try to find URL in window.open('URL') or location.href='URL'
                    const match = onClick.match(/(?:window\.open|location\.href)\s*=\s*['"]([^'"]+)['"]/) || 
                                  onClick.match(/['"]([^'"]+)['"]/); // Fallback: just grab string
                    if (match) {
                        extractedLink = match[1];
                        console.log(`   💡 Extracted link from onclick for "${btnText}"`);
                    }
                }
            }

            // Final Validation
            if (!extractedLink || extractedLink === '#' || extractedLink.startsWith('javascript')) {
                console.log(`   ⚠️ Skipped Button "${btnText}": No valid link found.`);
                return; // Continue to next button
            }

            // Fix relative URLs
            if (extractedLink.startsWith('/')) {
                extractedLink = new URL(extractedLink, vcloudLink).href;
            }

            console.log(`   ➡️ Processing Button: ${btnText} -> ${extractedLink}`);

            // 1. Direct Known Patterns (Fast Path)
            if (extractedLink.includes('.dev') || extractedLink.includes('workers.dev')) {
                streamLinks.push({ server: 'CF Worker', link: extractedLink, type: 'mkv' });
                return;
            }

            if (extractedLink.includes('pixeld')) {
                if (!extractedLink.includes('api')) {
                    const token = extractedLink.split('/').pop();
                    const pdBase = extractedLink.split('/').slice(0, -2).join('/');
                    extractedLink = `${pdBase}/api/file/${token}?download`;
                }
                streamLinks.push({ server: 'Pixeldrain', link: extractedLink, type: 'mkv' });
                return;
            }

            // 2. Resolve Unknown/Redirect Links (Async Path)
            const p = (async () => {
                try {
                    // HEAD Request to follow redirect
                    const newLinkRes = await axios.head(extractedLink, { 
                        headers: { ...headers, 'Referer': vcloudLink },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 400
                    });
                    
                    const finalUrl = newLinkRes.request?.res?.responseUrl || extractedLink;
                    // console.log(`      ↳ Resolved: ${finalUrl}`);

                    // Check resolved URL for known patterns
                    let nestedLink = finalUrl.split('link=')?.[1] || finalUrl;
                    // Sometimes decodeURIComponent is needed if nested
                    try { nestedLink = decodeURIComponent(nestedLink); } catch(e){}

                    // Determine Server Name
                    let serverName = btnText || 'Cloud Server';
                    if (nestedLink.includes('pixeld')) serverName = 'Pixeldrain';
                    else if (nestedLink.includes('drive.google')) serverName = 'G-Drive';
                    else if (nestedLink.includes('worker')) serverName = 'CF Worker';

                    // Special Logic for Pixeldrain after resolution
                    if (nestedLink.includes('pixeld') && !nestedLink.includes('api')) {
                         const token = nestedLink.split('/').pop();
                         nestedLink = `https://pixeldrain.com/api/file/${token}?download`;
                    }

                    // Push to streams
                    streamLinks.push({ 
                        server: serverName, 
                        link: nestedLink, 
                        type: 'mkv' 
                    });

                } catch (error) {
                    console.log(`⚠️ Failed to resolve link ${extractedLink}:`, error.message);
                    // Agar resolve fail hua, tab bhi original link daal do (kabhi kabhi direct chalta hai)
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
        
        // Remove duplicates based on link
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return uniqueStreams;

    } catch (error) {
        console.error('❌ Extractor Error:', error.message);
        return [];
    }
}

module.exports = hubcloudExtracter;
