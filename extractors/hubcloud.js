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

        console.log('🔄 Target V-Cloud Link found:', vcloudLink);

        // --- Step 2: Fetch Target Page ---
        const vcloudRes = await axios.get(vcloudLink, {
            headers: {
                ...headers,
                'Referer': link
            }
        });
        
        const html = vcloudRes.data;
        const $ = cheerio.load(html);
        console.log('📄 Page Fetched. Scanning for valid links...');

        const foundLinks = new Set();

        // --- METHOD A: Button Parsing ---
        $('.btn-success, .btn-danger, .btn-secondary, a.btn, .download-link').each((i, element) => {
            const href = $(element).attr('href');
            if (href && href.startsWith('http')) {
                foundLinks.add(href);
            }
        });

        // --- METHOD B: Script Regex ---
        // Regex ko thoda strict kiya hai taaki social media na pakde
        const regexPattern = /https?:\/\/[^"'\s<>]+(?:token=|id=|file\/|\.dev|drive|pixeldrain|boblover|hubcloud)/gi;
        const scriptMatches = html.match(regexPattern) || [];
        
        // --- STRICT FILTER LIST ---
        const JUNK_DOMAINS = [
            't.me', 'telegram', 'facebook', 'instagram', 'twitter', 'whatsapp', 'discord', 
            'wp-content', 'wp-includes', 'pixel.wp.com', 'google.com/search'
        ];

        scriptMatches.forEach(match => {
            let cleanLink = match.replace(/['";\)]+$/, '');
            
            // 🛑 Garbage Filter
            const isJunk = JUNK_DOMAINS.some(d => cleanLink.includes(d));
            const isBaseUrl = cleanLink === baseUrl || cleanLink === link || cleanLink === vcloudLink;
            
            // Sirf tab add karo jab wo junk na ho
            if (!isJunk && !isBaseUrl) {
                foundLinks.add(cleanLink);
            }
        });

        console.log(`🔍 Total unique potential links found: ${foundLinks.size}`);

        // --- Step 3: Process & Resolve ---
        const processingPromises = Array.from(foundLinks).map(async (rawLink) => {
            try {
                // Secondary Filter Check
                if (JUNK_DOMAINS.some(d => rawLink.includes(d))) return;

                // Determine Server Name
                let serverName = 'Cloud Server';
                if (rawLink.includes('boblover')) serverName = 'FSL/TRS Server';
                else if (rawLink.includes('pixeld')) serverName = 'Pixeldrain';
                else if (rawLink.includes('worker')) serverName = 'CF Worker';

                // --- Resolution Logic ---
                if (rawLink.includes('boblover') || rawLink.includes('hubcloud') || rawLink.includes('/?id=')) {
                    
                    const newLinkRes = await axios.head(rawLink, { 
                        headers: { ...headers, 'Referer': vcloudLink },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 400
                    });
                    
                    const finalUrl = newLinkRes.request?.res?.responseUrl || rawLink;
                    let nestedLink = finalUrl.split('link=')?.[1] || finalUrl;
                    try { nestedLink = decodeURIComponent(nestedLink); } catch(e){}

                    // 🛑 Agar resolve hoke wapas wahi page aa gaya ya Telegram ban gaya, toh discard karo
                    if (nestedLink.includes('t.me') || nestedLink === vcloudLink) {
                        return;
                    }

                    // Rename server if resolved to something known
                    if (nestedLink.includes('pixeld')) serverName = 'Pixeldrain';
                    else if (nestedLink.includes('workers')) serverName = 'CF Worker';

                    // Pixeldrain Fix
                    if (nestedLink.includes('pixeld') && !nestedLink.includes('api')) {
                        const token = nestedLink.split('/').pop();
                        nestedLink = `https://pixeldrain.com/api/file/${token}?download`;
                    }

                    streamLinks.push({ server: serverName, link: nestedLink, type: 'mkv' });

                } else {
                    // Direct links handling
                    if (rawLink.includes('pixeld')) {
                         if (!rawLink.includes('api')) {
                            const token = rawLink.split('/').pop();
                            const pdBase = rawLink.split('/').slice(0, -2).join('/');
                            rawLink = `${pdBase}/api/file/${token}?download`;
                        }
                        serverName = 'Pixeldrain';
                    }
                    
                    // Push direct link
                    streamLinks.push({ server: serverName, link: rawLink, type: 'mkv' });
                }

            } catch (error) {
                // console.log(`⚠️ Link failed: ${rawLink}`);
            }
        });

        await Promise.all(processingPromises);

        // --- Step 4: Final Cleanup (Duplicate Removal) ---
        const uniqueStreams = [];
        const seenUrls = new Set();

        streamLinks.forEach(item => {
            // Final check: Link must NOT be empty, NOT be Telegram, NOT be the Base URL
            if (
                item.link && 
                item.link.startsWith('http') && 
                !seenUrls.has(item.link) &&
                !item.link.includes('t.me') &&
                !item.link.includes('hubcloud.foo/drive') // Specific filter for your issue
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
