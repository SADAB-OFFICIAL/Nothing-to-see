const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const decode = function (value) {
    if (!value) return '';
    return Buffer.from(value, 'base64').toString('utf-8');
};

// Helper to clean button text
const cleanServerName = (text) => {
    if (!text) return 'Cloud Server';
    // Remove "Download", "Watch", brackets [], and extra spaces
    let clean = text.replace(/Download|Watch|Link|\[|\]/gi, '').trim();
    // Remove starting colon if present (e.g. ": 10Gbps")
    if (clean.startsWith(':')) clean = clean.substring(1).trim();
    return clean || 'Cloud Server';
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
        console.log('📄 Page Fetched. Scanning for buttons...');

        const foundLinks = new Set();
        const linkData = []; // Store link AND title

        // --- METHOD A: Button Parsing (Primary) ---
        $('.btn-success, .btn-danger, .btn-secondary, a.btn, .download-link').each((i, element) => {
            const itm = $(element);
            const href = itm.attr('href');
            const rawText = itm.text().trim();
            const serverName = cleanServerName(rawText);

            if (href && href.startsWith('http')) {
                // Store object to keep track of name
                linkData.push({ href, name: serverName });
                foundLinks.add(href);
            }
        });

        // --- METHOD B: Script Regex (Backup) ---
        // Only if buttons fail or for hidden links
        const regexPattern = /https?:\/\/[^"'\s<>]+(?:token=|id=|file\/|\.dev|drive|pixeldrain|boblover|hubcloud)/gi;
        const scriptMatches = html.match(regexPattern) || [];
        
        const JUNK_DOMAINS = [
            't.me', 'telegram', 'facebook', 'instagram', 'twitter', 'whatsapp', 'discord', 
            'wp-content', 'wp-includes', 'pixel.wp.com', 'google.com/search'
        ];

        scriptMatches.forEach(match => {
            let cleanLink = match.replace(/['";\)]+$/, '');
            const isJunk = JUNK_DOMAINS.some(d => cleanLink.includes(d));
            const isBaseUrl = cleanLink === baseUrl || cleanLink === link || cleanLink === vcloudLink;
            
            if (!isJunk && !isBaseUrl && !foundLinks.has(cleanLink)) {
                // Script links usually don't have text, so we give them a generic name or guess
                let name = 'Cloud Server';
                if(cleanLink.includes('pixeld')) name = 'PixelDrain';
                else if(cleanLink.includes('boblover')) name = 'FSL/TRS Server';
                
                linkData.push({ href: cleanLink, name: name });
                foundLinks.add(cleanLink);
            }
        });

        console.log(`🔍 Total unique links to process: ${linkData.length}`);

        // --- Step 3: Process & Resolve ---
        const processingPromises = linkData.map(async (item) => {
            const rawLink = item.href;
            let serverName = item.name;

            try {
                if (JUNK_DOMAINS.some(d => rawLink.includes(d))) return;

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

                    if (nestedLink.includes('t.me') || nestedLink === vcloudLink) return;

                    // Rename ONLY if generic, otherwise keep button text
                    if (serverName === 'Cloud Server') {
                        if (nestedLink.includes('pixeld')) serverName = 'Pixeldrain';
                        else if (nestedLink.includes('workers')) serverName = 'CF Worker';
                    }

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
                        // Only override if name is generic, otherwise keep "PixelServer : 2" etc.
                        if(serverName === 'Cloud Server') serverName = 'Pixeldrain';
                    }
                    
                    streamLinks.push({ server: serverName, link: rawLink, type: 'mkv' });
                }

            } catch (error) {
                // console.log(`⚠️ Link failed: ${rawLink}`);
            }
        });

        await Promise.all(processingPromises);

        // --- Step 4: Final Cleanup ---
        const uniqueStreams = [];
        const seenUrls = new Set();

        // Sort priority: Put FSL/TRS/Pixel first, generic last (Optional)
        streamLinks.sort((a, b) => {
            const priority = ['FSL', 'TRS', 'Pixel', '10Gbps'];
            const aP = priority.findIndex(p => a.server.includes(p));
            const bP = priority.findIndex(p => b.server.includes(p));
            return (bP === -1 ? 0 : bP) - (aP === -1 ? 0 : aP); // Higher priority first
        });

        streamLinks.forEach(item => {
            if (
                item.link && 
                item.link.startsWith('http') && 
                !seenUrls.has(item.link) &&
                !item.link.includes('t.me') &&
                !item.link.includes('hubcloud.foo/drive')
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
