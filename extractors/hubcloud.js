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
    let clean = text.replace(/Download|Watch|Link|\[|\]/gi, '').trim();
    if (clean.startsWith(':')) clean = clean.substring(1).trim();
    return clean || 'Cloud Server';
};

async function hubcloudExtracter(link) {
    try {
        console.log('🚀 HubCloud Logic Started for:', link);
        const baseUrl = link.split('/').slice(0, 3).join('/');
        const streamLinks = [];
        let finalTitle = "Unknown Title"; // Default

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
            headers: { ...headers, 'Referer': link }
        });
        
        const html = vcloudRes.data;
        const $ = cheerio.load(html);
        
        // --- 🆕 TITLE SCRAPING ---
        // HubCloud/VCloud headers usually contain the title
        const scrapedTitle = $('.card-header, .panel-heading, .alert-primary').first().text().trim();
        
        if (scrapedTitle) {
            // Clean up filename extensions if present
            finalTitle = scrapedTitle.replace(/\.mkv|\.mp4/gi, '').trim();
        } else {
            const pageTitle = $('title').text().trim();
            finalTitle = pageTitle.replace('HubCloud - ', '').replace('HubCloud', '').trim();
        }

        console.log('🎬 Extracted Title:', finalTitle);

        // --- Step 3: Parse Buttons ---
        const linkData = [];
        const foundLinks = new Set();

        $('.btn-success, .btn-danger, .btn-secondary, a.btn, .download-link').each((i, element) => {
            const itm = $(element);
            const href = itm.attr('href');
            const rawText = itm.text().trim();
            const serverName = cleanServerName(rawText);

            if (href && href.startsWith('http')) {
                linkData.push({ href, name: serverName });
                foundLinks.add(href);
            }
        });

        // Script Regex (Backup)
        const regexPattern = /https?:\/\/[^"'\s<>]+(?:token=|id=|file\/|\.dev|drive|pixeldrain|boblover|hubcloud)/gi;
        const scriptMatches = html.match(regexPattern) || [];
        const JUNK_DOMAINS = ['t.me', 'telegram', 'facebook', 'twitter', 'whatsapp', 'google.com/search'];

        scriptMatches.forEach(match => {
            let cleanLink = match.replace(/['";\)]+$/, '');
            const isJunk = JUNK_DOMAINS.some(d => cleanLink.includes(d));
            const isBaseUrl = cleanLink === baseUrl || cleanLink === link || cleanLink === vcloudLink;
            
            if (!isJunk && !isBaseUrl && !foundLinks.has(cleanLink)) {
                let name = 'Cloud Server';
                if(cleanLink.includes('pixeld')) name = 'PixelDrain';
                else if(cleanLink.includes('boblover')) name = 'FSL/TRS Server';
                
                linkData.push({ href: cleanLink, name: name });
                foundLinks.add(cleanLink);
            }
        });

        // --- Step 4: Resolve Links ---
        const processingPromises = linkData.map(async (item) => {
            const rawLink = item.href;
            let serverName = item.name;

            try {
                if (JUNK_DOMAINS.some(d => rawLink.includes(d))) return;

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

                    if (serverName === 'Cloud Server') {
                        if (nestedLink.includes('pixeld')) serverName = 'PixelDrain';
                        else if (nestedLink.includes('workers')) serverName = 'CF Worker';
                    }

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
                        if(serverName === 'Cloud Server') serverName = 'Pixeldrain';
                    }
                    streamLinks.push({ server: serverName, link: rawLink, type: 'mkv' });
                }
            } catch (error) {}
        });

        await Promise.all(processingPromises);

        // Deduplicate
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        // Return Object
        return {
            title: finalTitle,
            streams: uniqueStreams
        };

    } catch (error) {
        console.error('❌ Extractor Error:', error.message);
        return { title: 'Error', streams: [] };
    }
}

module.exports = hubcloudExtracter;
