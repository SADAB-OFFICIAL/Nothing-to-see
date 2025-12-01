const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const decode = function (value) {
    if (!value) return '';
    return Buffer.from(value, 'base64').toString('utf-8');
};

async function hubcloudExtracter(link) {
    try {
        // Clean link (remove trailing chars like &)
        if (link.endsWith('&')) link = link.slice(0, -1);

        console.log('🚀 HubCloud/V-Cloud Logic Started for:', link);
        const baseUrl = link.split('/').slice(0, 3).join('/');
        let streamLinks = [];

        // --- Step 1: Get Landing Page ---
        const vLinkRes = await axios.get(link, { headers });
        const vLinkText = vLinkRes.data;
        const $vLink = cheerio.load(vLinkText);

        const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
        let vcloudLink =
            decode(vLinkRedirect[1]?.split('r=')?.[1]) ||
            vLinkRedirect[1] ||
            $vLink('.fa-file-download.fa-lg').parent().attr('href') ||
            link;

        if (vcloudLink?.startsWith('/')) {
            vcloudLink = `${baseUrl}${vcloudLink}`;
        }

        console.log('🔄 Target Link found:', vcloudLink);

        // --- Step 2: Fetch Target Page ---
        const vcloudRes = await axios.get(vcloudLink, {
            headers: {
                ...headers,
                'Referer': link
            }
        });
        
        const html = vcloudRes.data;
        const $ = cheerio.load(html);
        console.log('📄 Page Fetched. Scanning for links...');

        const foundLinks = new Set();

        // --- METHOD A: Button Parsing ---
        $('.btn-success, .btn-danger, .btn-secondary, a.btn, .download-link').each((i, element) => {
            const href = $(element).attr('href');
            if (href && href.startsWith('http')) {
                foundLinks.add(href);
            }
        });

        // --- METHOD B: Script Regex (UPDATED FOR VCLOUD) ---
        // Added 'vcloud' to the regex
        const regexPattern = /https?:\/\/[^"'\s<>]+(?:token=|id=|file\/|\.dev|drive|pixeldrain|boblover|hubcloud|vcloud)/gi;
        const scriptMatches = html.match(regexPattern) || [];
        
        const JUNK_DOMAINS = [
            't.me', 'telegram', 'facebook', 'instagram', 'twitter', 'whatsapp', 'discord', 
            'wp-content', 'wp-includes', 'pixel.wp.com', 'google.com/search'
        ];

        scriptMatches.forEach(match => {
            let cleanLink = match.replace(/['";\)]+$/, '');
            
            const isJunk = JUNK_DOMAINS.some(d => cleanLink.includes(d));
            // Base URL filter ko thoda smart banaya hai
            const isBaseUrl = cleanLink === baseUrl || cleanLink === link || cleanLink === vcloudLink;
            
            if (!isJunk && !isBaseUrl) {
                foundLinks.add(cleanLink);
            }
        });

        console.log(`🔍 Total unique potential links found: ${foundLinks.size}`);

        // --- Step 3: Process & Resolve ---
        const processingPromises = Array.from(foundLinks).map(async (rawLink) => {
            try {
                if (JUNK_DOMAINS.some(d => rawLink.includes(d))) return;

                let serverName = 'Cloud Server';
                if (rawLink.includes('boblover')) serverName = 'FSL/TRS Server';
                else if (rawLink.includes('pixeld')) serverName = 'Pixeldrain';
                else if (rawLink.includes('worker')) serverName = 'CF Worker';

                // --- Resolution Logic (UPDATED) ---
                // Added 'vcloud' check here too
                if (rawLink.includes('boblover') || rawLink.includes('hubcloud') || rawLink.includes('vcloud') || rawLink.includes('/?id=')) {
                    
                    const newLinkRes = await axios.head(rawLink, { 
                        headers: { ...headers, 'Referer': vcloudLink },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 400
                    });
                    
                    const finalUrl = newLinkRes.request?.res?.responseUrl || rawLink;
                    let nestedLink = finalUrl.split('link=')?.[1] || finalUrl;
                    try { nestedLink = decodeURIComponent(nestedLink); } catch(e){}

                    if (nestedLink.includes('t.me') || nestedLink === vcloudLink) return;

                    if (nestedLink.includes('pixeld')) serverName = 'Pixeldrain';
                    else if (nestedLink.includes('workers')) serverName = 'CF Worker';

                    if (nestedLink.includes('pixeld') && !nestedLink.includes('api')) {
                        const token = nestedLink.split('/').pop();
                        nestedLink = `https://pixeldrain.com/api/file/${token}?download`;
                    }

                    streamLinks.push({ server: serverName, link: nestedLink, type: 'mkv' });

                } else {
                    if (rawLink.includes('pixeld')) {
                         if (!rawLink.includes('api')) {
                            const token = rawLink.split('/').pop();
                            const pdBase = rawLink.split('/').slice(0, -2).join('/');
                            rawLink = `${pdBase}/api/file/${token}?download`;
                        }
                        serverName = 'Pixeldrain';
                    }
                    streamLinks.push({ server: serverName, link: rawLink, type: 'mkv' });
                }

            } catch (error) {
                // Silent error
            }
        });

        await Promise.all(processingPromises);

        const uniqueStreams = [];
        const seenUrls = new Set();

        streamLinks.forEach(item => {
            if (
                item.link && 
                item.link.startsWith('http') && 
                !seenUrls.has(item.link) &&
                !item.link.includes('t.me') &&
                !item.link.includes('hubcloud.foo/drive') &&
                !item.link.includes('vcloud.zip/drive') // Added vcloud filter
            ) {
                seenUrls.add(item.link);
                uniqueStreams.push(item);
            }
        });

        return uniqueStreams;

    } catch (error) {
        console.error('❌ Extractor Error:', error.message);
        return [];
    }
}

module.exports = hubcloudExtracter;
