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

        // Step 1: Landing Page Fetch
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

        console.log('🔄 Target V-Cloud Link:', vcloudLink);

        // Step 2: Fetch Target Page
        const vcloudRes = await fetch(vcloudLink, {
            headers,
            redirect: 'follow',
        });
        const vcloudText = await vcloudRes.text();
        const $ = cheerio.load(vcloudText);

        // Step 3: Parse Buttons
        const linkClass = $('.btn-success.btn-lg.h6,.btn-danger,.btn-secondary');
        const promises = [];

        linkClass.each((i, element) => {
            const itm = $(element);
            let extractedLink = itm.attr('href') || '';
            
            // Logic A: CF Worker / Direct
            if (extractedLink?.includes('.dev') && !extractedLink?.includes('/?id=')) {
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

            // Logic C: Nested HubCloud Links
            if (extractedLink?.includes('hubcloud') || extractedLink?.includes('/?id=')) {
                const p = (async () => {
                    try {
                        const newLinkRes = await axios.head(extractedLink, { headers });
                        const finalUrl = newLinkRes.request?.res?.responseUrl || extractedLink;
                        const newLink = finalUrl.split('link=')?.[1] || finalUrl;
                        streamLinks.push({ server: 'HubCloud VIP', link: newLink, type: 'mkv' });
                    } catch (error) {
                        console.log('⚠️ Nested link error:', error.message);
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
        return streamLinks;

    } catch (error) {
        console.error('❌ Extractor Error:', error.message);
        return [];
    }
}

module.exports = hubcloudExtracter;
