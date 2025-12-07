const axios = require('axios');
const cheerio = require('cheerio');
const headers = require('../headers');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const decodeBase64 = (str) => { try { return Buffer.from(str, 'base64').toString('utf-8'); } catch (e) { return ''; } };

async function nexdriveExtractor(url) {
    try {
        console.log('🚀 NexDrive:', url);
        const streamLinks = [];
        
        const res = await axios.get(url, { headers });
        let $ = cheerio.load(res.data);
        const scriptContent = $('script:contains("const encoded =")').html();
        
        if (scriptContent) {
            const match = scriptContent.match(/const\s+encoded\s*=\s*"([^"]+)"/);
            if (match && match[1]) $ = cheerio.load(decodeBase64(match[1]));
        }

        const promises = [];
        const processed = new Set();

        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if(!href || href === '#' || !href.startsWith('http') || processed.has(href)) return;
            processed.add(href);

            // G-Direct
            if (text.includes('G-Direct') || text.includes('Instant') || href.includes('fastdl.lat')) {
                promises.push((async () => {
                    try {
                        const fRes = await axios.get(href, { headers: { ...headers, 'Referer': url } });
                        const $$ = cheerio.load(fRes.data);
                        const fl = $$('a.btn-primary').attr('href') || $$('a:contains("Download Now")').attr('href');
                        if (fl) streamLinks.push({ server: 'G-Direct [Instant]', link: fl, type: 'mkv' });
                    } catch(e) {}
                })());
            }

            // M-Cloud
            if (text.includes('M-Cloud') || href.includes('mcloud.mom')) {
                promises.push((async () => {
                    try {
                        const mRes = await axios.get(href, { headers });
                        const mHtml = mRes.data;
                        const $m = cheerio.load(mHtml);
                        const formData = new URLSearchParams();
                        let count = 0;
                        
                        const regex = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/g;
                        let match;
                        while ((match = regex.exec(mHtml)) !== null) { formData.append(match[1], match[2]); count++; }

                        let finalUrl = null;
                        if(count > 0) {
                            await sleep(3500);
                            const pRes = await axios.post(href, formData, {
                                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': href, 'Cookie': mRes.headers['set-cookie']?.join('; ') },
                                maxRedirects: 5
                            });
                            finalUrl = pRes.request.res.responseUrl;
                        } else {
                            const sc = mHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/) || mHtml.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
                            if(sc) finalUrl = sc[1];
                        }

                        if(finalUrl) {
                            const gRes = await axios.get(finalUrl, { headers: { ...headers, 'Referer': href } });
                            const $g = cheerio.load(gRes.data);
                            const btns = $g('a.btn, .btn-danger, .btn-success');
                            
                            const innerP = [];
                            btns.each((k, b) => {
                                const bLink = $g(b).attr('href');
                                let bText = $g(b).text().trim().replace(/Download|\[|\]|Server|:| /g, ' ').trim() || 'Cloud';
                                if(bLink && bLink.startsWith('http')) {
                                    innerP.push((async () => {
                                        let fl = bLink;
                                        // 10Gbps / HubCDN Fix
                                        if(bText.includes('10Gbps') || bLink.includes('hubcdn') || bLink.includes('carnewz')) {
                                            try {
                                                const hRes = await axios.get(bLink, { headers: { ...headers, 'Referer': finalUrl } });
                                                const matches = hRes.data.match(/https:\/\/video-downloads\.googleusercontent\.com\/[^"'\s<>;)]+/g);
                                                if(matches) { fl = matches.reduce((a, b) => a.length > b.length ? a : b).replace(/\\/g, ''); bText = 'Server : 10Gbps'; }
                                                else if(hRes.request.res.responseUrl.includes('?url=')) {
                                                     fl = decodeURIComponent(hRes.request.res.responseUrl.split('?url=')[1].split('&')[0]); bText = 'Server : 10Gbps';
                                                }
                                            } catch(e){}
                                        }
                                        // Resolve
                                        else if(bLink.includes('boblover') || bLink.includes('hubcloud')) {
                                            try {
                                                const hr = await axios.head(bLink, { headers: { ...headers, 'Referer': finalUrl }, validateStatus: s=>s<400 });
                                                const r = hr.request.res.responseUrl;
                                                fl = r.split('link=')?.[1] || r;
                                                try { fl = decodeURIComponent(fl); } catch(e){}
                                            } catch(e){}
                                        }
                                        if(fl.includes('pixeld')) {
                                            bText = 'PixelDrain';
                                            if(!fl.includes('api')) fl = `https://pixeldrain.com/api/file/${fl.split('/').pop()}?download`;
                                        }
                                        if(!fl.includes('t.me')) streamLinks.push({ server: bText, link: fl, type: 'mkv' });
                                    })());
                                }
                            });
                            await Promise.all(innerP);
                        }
                    } catch(e) {}
                })());
                promises.push(p);
            }
        });

        await Promise.all(promises);
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link))).map(link => streamLinks.find(a => a.link === link));
        uniqueStreams.sort((a, b) => (a.server.includes('10Gbps') ? -1 : a.server.includes('G-Direct') ? -1 : 1));
        
        return { title: $('title').text().trim(), streams: uniqueStreams };
    } catch (e) { return { title: 'Error', streams: [] }; }
}
module.exports = nexdriveExtractor;
                                            }
                                        }

                                        // Junk Filter
                                        if (!finalLink.includes('t.me') && !finalLink.includes('telegram')) {
                                            streamLinks.push({ server: serverName, link: finalLink, type: 'mkv' });
                                        }
                                    })());
                                }
                            });
                            await Promise.all(innerPromises);
                        }

                    } catch (e) {
                        console.log('❌ M-Cloud Critical Error:', e.message);
                    }
                })();
                promises.push(p);
            }
        });

        await Promise.all(promises);
        
        // Final Deduplication
        const uniqueStreams = Array.from(new Set(streamLinks.map(a => a.link)))
            .map(link => streamLinks.find(a => a.link === link));
        
        // Sort: 10Gbps first, then G-Direct
        uniqueStreams.sort((a, b) => {
            if (a.server.includes('10Gbps')) return -1;
            if (a.server.includes('G-Direct')) return -1;
            return 0;
        });

        return uniqueStreams;

    } catch (error) {
        console.error('❌ NexDrive Global Error:', error.message);
        return [];
    }
}

module.exports = nexdriveExtractor;
