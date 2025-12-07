const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

const decode = function (value) {
    if (!value) return '';
    return Buffer.from(value, 'base64').toString('utf-8');
};

const cleanServerName = (text) => {
    if (!text) return 'Cloud Server';
    let clean = text.replace(/Download|Watch|Link|\[|\]/gi, '').trim();
    if (clean.startsWith(':')) clean = clean.substring(1).trim();
    return clean || 'Cloud Server';
};

async function hubcloudExtracter(link) {
    try {
        const baseUrl = link.split('/').slice(0, 3).join('/');
        let finalTitle = "Unknown Title";

        const vLinkRes = await axios.get(link, { headers });
        const vLinkText = vLinkRes.data;
        const $vLink = cheerio.load(vLinkText);

        const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
        let vcloudLink = decode(vLinkRedirect[1]?.split('r=')?.[1]) || vLinkRedirect[1] || $vLink('.fa-file-download.fa-lg').parent().attr('href') || link;

        if (vcloudLink?.startsWith('/')) vcloudLink = `${baseUrl}${vcloudLink}`;

        const vcloudRes = await axios.get(vcloudLink, { headers: { ...headers, 'Referer': link } });
        const $ = cheerio.load(vcloudRes.data);

        // Title Extraction
        const scrapedTitle = $('.card-header, .panel-heading, h4.text-primary, .alert-primary').first().text().trim();
        finalTitle = scrapedTitle ? scrapedTitle.replace(/\.mkv|\.mp4/gi, '').trim() : "Unknown Title";

        const streamLinks = [];
        const foundLinks = new Set();
        const promises = [];

        $('.btn-success, .btn-danger, .btn-secondary, a.btn').each((i, element) => {
            const href = $(element).attr('href');
            const name = cleanServerName($(element).text().trim());
            if (href && href.startsWith('http')) {
                const p = (async () => {
                    let finalLink = href;
                    let server = name;
                    
                    if (href.includes('hubcloud') || href.includes('boblover')) {
                        try {
                            const h = await axios.head(href, { headers: { ...headers, 'Referer': vcloudLink } });
                            finalLink = h.request.res.responseUrl;
                        } catch(e){}
                    }

                    if (finalLink.includes('pixeld')) {
                        server = 'PixelDrain';
                        if(!finalLink.includes('api')) finalLink = `https://pixeldrain.com/api/file/${finalLink.split('/').pop()}?download`;
                    }
                    
                    if (!finalLink.includes('t.me')) {
                        streamLinks.push({ server, link: finalLink, type: 'mkv' });
                    }
                })();
                promises.push(p);
            }
        });

        await Promise.all(promises);
        
        // Deduplicate
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));

        return { title: finalTitle, streams: uniqueStreams };

    } catch (error) {
        return { title: 'Error', streams: [] };
    }
}
module.exports = hubcloudExtracter;
