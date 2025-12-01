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
        console.log('📄 Page Fetched. Scanning for links...');

        // Set to store unique links found
        const foundLinks = new Set();

        // --- METHOD A: Button Parsing (Standard) ---
        $('.btn-success, .btn-danger, .btn-secondary, a.btn, .download-link').each((i, element) => {
            const href = $(element).attr('href');
            if (href && href.startsWith('http')) {
                foundLinks.add(href);
            }
        });

        // --- METHOD B: Script Regex (For TRS/Android buttons) ---
        // Ye script tags ke andar URLs dhoondhega (e.g. window.location='...')
        // Regex looks for http/https links containing specific keywords
        const regexPattern = /https?:\/\/[^"'\s<>]+(?:token=|id=|file\/|\.dev|drive|pixeldrain|boblover|hubcloud)/gi;
        const scriptMatches = html.match(regexPattern) || [];
        
        scriptMatches.forEach(match => {
            // Filter junk matches
            if (!match.includes('google.com') && !match.includes('facebook.com') && !match.includes('w3.org')) {
                // Remove trailing quotes or semicolons if regex caught them
                const cleanLink = match.replace(/['";\)]+$/, '');
                foundLinks.add(cleanLink);
            }
        });

        console.log(`🔍 Total unique potential links found: ${foundLinks.size}`);

        // --- Step 3: Process & Resolve All Found Links ---
        const processingPromises = Array.from(foundLinks).map(async (rawLink) => {
            try {
                // Skip if obviously not a video link
                if (rawLink.includes('.css') || rawLink.includes('.js') || rawLink.includes('wp-content')) return;

                // Determine Server Name (Guessing)
                let serverName = 'Cloud Server';
                if (rawLink.includes('boblover')) serverName = 'FSL/TRS Server';
                if (rawLink.includes('pixeld')) serverName = 'Pixeldrain';
                if (rawLink.includes('worker')) serverName = 'CF Worker';

                // --- Resolution Logic ---
                // Agar link boblover/hubcloud hai, toh usse resolve karo
                if (rawLink.includes('boblover') || rawLink.includes('hubcloud') || rawLink.includes('/?id=')) {
                    
                    const newLinkRes = await axios.head(rawLink, { 
                        headers: { ...headers, 'Referer': vcloudLink },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 400
                    });
                    
                    const finalUrl = newLinkRes.request?.res?.responseUrl || rawLink;
                    let nestedLink = finalUrl.split('link=')?.[1] || finalUrl;
                    try { nestedLink = decodeURIComponent(nestedLink); } catch(e){}

                    // Rename server based on resolved link
                    if (nestedLink.includes('pixeld')) serverName = 'Pixeldrain';
                    else if (nestedLink.includes('workers')) serverName = 'CF Worker';

                    // Pixeldrain API conversion
                    if (nestedLink.includes('pixeld') && !nestedLink.includes('api')) {
                        const token = nestedLink.split('/').pop();
                        nestedLink = `https://pixeldrain.com/api/file/${token}?download`;
                    }

                    streamLinks.push({ server: serverName, link: nestedLink, type: 'mkv' });

                } else {
                    // Direct links (PixelDrain direct, Workers, etc.)
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
                console.log(`⚠️ Failed to process ${rawLink}:`, error.message);
            }
        });

        await Promise.all(processingPromises);

        // --- Step 4: Final Cleanup ---
        // Duplicates hatao aur invalid links filter karo
        const uniqueStreams = [];
        const seenUrls = new Set();

        streamLinks.forEach(item => {
            if (
                item.link && 
                item.link.startsWith('http') && 
                !seenUrls.has(item.link) &&
                !item.link.includes('facebook') && // Safety check
                !item.link.includes('twitter')
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
