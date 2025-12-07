const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');

async function gdFlixExtracter(link) {
    try {
        const res = await axios.get(link, { headers });
        let data = res.data;
        let $ = cheerio.load(data);
        let currentUrl = res.request.res.responseUrl || link;

        if (data.includes('location.replace')) {
            const redirectMatch = data.match(/location\.replace\(['"]([^'"]+)['"]\)/);
            if (redirectMatch) {
                const newRes = await axios.get(redirectMatch[1], { headers });
                $ = cheerio.load(newRes.data);
                currentUrl = redirectMatch[1];
            }
        }

        const urlObj = new URL(currentUrl);
        const baseUrl = urlObj.origin;
        const streamLinks = [];
        const promises = [];

        const processButton = async (btnLink, serverName) => {
            if (!btnLink) return;
            if (!btnLink.startsWith('http')) btnLink = `${baseUrl}${btnLink.startsWith('/') ? '' : '/'}${btnLink}`;

            if (btnLink.includes('pixeld')) {
                const id = btnLink.split('/').pop();
                streamLinks.push({ server: 'PixelDrain', link: `https://pixeldrain.com/api/file/${id}?download`, type: 'mkv' });
                return;
            }

            try {
                if (btnLink.includes('busycdn') || btnLink.includes('fastcdn') || btnLink.includes('pages.dev')) {
                    const intRes = await axios.get(btnLink, { headers, maxRedirects: 5 });
                    const finalPageUrl = intRes.request.res.responseUrl;
                    let finalLink = null;

                    if (finalPageUrl.includes('?url=')) finalLink = decodeURIComponent(finalPageUrl.split('?url=')[1].split('&')[0]);
                    
                    if (!finalLink) {
                        const html = intRes.data;
                        const match = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i) || html.match(/url\s*=\s*["']([^"']+)["']/i);
                        if(match) finalLink = match[1];
                    }

                    if(!finalLink) {
                        const $$ = cheerio.load(intRes.data);
                        finalLink = $$('a.btn-primary').attr('href') || $$('a:contains("Download Now")').attr('href');
                    }

                    if (finalLink) streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                } 
                else if (btnLink.includes('url=') || btnLink.includes('id=')) {
                    // Old API Token
                    const token = btnLink.split(/url=|id=/)[1];
                    const apiRes = await axios.post(`${baseUrl}/api`, `keys=${token}`, {
                        headers: { 'x-token': currentUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    if (apiRes.data?.url) streamLinks.push({ server: serverName, link: apiRes.data.url, type: 'mkv' });
                } else {
                    streamLinks.push({ server: serverName, link: btnLink, type: 'mkv' });
                }
            } catch (e) {}
        };

        const buttons = $('a.btn, a.button, a[class*="btn-"]');
        const processed = new Set();

        buttons.each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().toUpperCase();
            if(!href || href === '#' || processed.has(href)) return;
            processed.add(href);

            let type = null;
            if (text.includes('INSTANT')) type = 'G-Drive Instant';
            else if (text.includes('CLOUD') && text.includes('R2')) type = 'Cloud R2';
            else if (text.includes('FAST CLOUD') || text.includes('ZIPDISK')) type = 'Fast Cloud';
            else if (text.includes('PIXELDRAIN')) type = 'PixelDrain';
            
            if (type) promises.push(processButton(href, type));
        });

        await Promise.all(promises);
        
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link))).map(link => streamLinks.find(a => a.link === link));
        return { title: 'GDFlix Content', streams: uniqueStreams };
    } catch (e) { return { title: 'Error', streams: [] }; }
}
module.exports = gdFlixExtracter;
