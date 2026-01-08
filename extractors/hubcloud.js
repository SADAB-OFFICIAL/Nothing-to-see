const cheerio = require("cheerio");
const axios = require("axios");
const headers = require("../headers");

// --- CONFIGURATION ---
const TOKEN_SOURCE = "https://vcloud.zip/hr17ehaeym7rza9";
const BASE_GAMER_URL = "https://gamerxyt.com/hubcloud.php";

// --- HELPER: Token Generator ---
async function getFreshToken() {
    try {
        console.log("🔄 [TOKEN] Generating Fresh Token...");
        // Random timestamp to avoid caching
        const target = `${TOKEN_SOURCE}?t=${Date.now()}`;
        const { data } = await axios.get(target, { 
            headers: { ...headers, "Cache-Control": "no-cache" } 
        });
        const match = data.match(/token=([^&"'\s<>]+)/);
        return match ? match[1] : null;
    } catch (e) {
        console.error("❌ [TOKEN] Network Error:", e.message);
        return null;
    }
}

// --- HELPER: Token System Processor (Universal) ---
async function processWithToken(id, host) {
    console.log(`🛡️ Activating Token Bypass [Host: ${host}]...`);
    
    const token = await getFreshToken();
    if (!token) throw new Error("Token generation failed");

    // Construct Magic URL with Dynamic Host
    const magicUrl = `${BASE_GAMER_URL}?host=${host}&id=${id}&token=${token}`;
    console.log("🔗 Generated Magic URL:", magicUrl);

    // Scrape Magic URL
    const finalPageHtml = await followRedirectsAndGetHtml(magicUrl);
    return extractStreamsFromHtml(finalPageHtml);
}

// --- MAIN EXTRACTOR ---
module.exports = async function (url) {
    try {
        console.log("\n🚀 [START] Processing URL:", url);

        // ID Extraction (Works for /video/id and /drive/id)
        const id = url.split('/').pop();
        if (!id) throw new Error("Invalid ID in URL");

        // ---------------------------------------------------------
        // 🎥 LOGIC 1: VIDEO HOST CHECK (High Priority)
        // ---------------------------------------------------------
        // Example: https://hubcloud.foo/video/vawsz0gkihh1wpw
        if (url.includes("/video/")) {
            console.log("🎥 Mode: Video Host Detected (Special HubCloud Link)");
            return await processWithToken(id, 'video');
        }

        // ---------------------------------------------------------
        // 🔒 LOGIC 2: STANDARD HUBCLOUD
        // ---------------------------------------------------------
        else if (url.includes("hubcloud") || url.includes("hubdrive")) {
            console.log("🔒 Mode: Standard HubCloud");
            return await processWithToken(id, 'hubcloud');
        } 
        
        // ---------------------------------------------------------
        // ⚡ LOGIC 3: V-CLOUD (Hybrid Strategy)
        // ---------------------------------------------------------
        else {
            console.log("⚡ Mode: V-Cloud (Hybrid)");
            
            // Step 1: Try Direct Scraping (Fastest)
            try {
                const { data: vCloudData } = await axios.get(url, { headers });
                const directResult = extractStreamsFromHtml(vCloudData, true); // Silent check
                
                if (directResult.streams && directResult.streams.length > 0) {
                    console.log("✅ Streams found directly on V-Cloud page!");
                    return directResult;
                }

                // Step 2: Look for Redirect Button (Download/View)
                const $ = cheerio.load(vCloudData);
                const nextLink = $('a:contains("Download"), a:contains("View"), .btn-primary, .btn-success').attr("href");

                if (nextLink && nextLink.startsWith('http')) {
                    console.log("↪️ Following Redirect Link:", nextLink);
                    const { data: finalData } = await axios.get(nextLink, { headers });
                    return extractStreamsFromHtml(finalData);
                }
            } catch (err) {
                console.log("⚠️ Direct V-Cloud scrape failed, switching to Token System...");
            }

            // Step 3: Fallback to Token System (host=vcloud)
            console.log("🔥 Direct failed. Using Token System for V-Cloud...");
            return await processWithToken(id, 'vcloud');
        }

    } catch (e) {
        console.error("❌ [CRITICAL ERROR]:", e.message);
        return { error: "Failed to extract links" };
    }
};

// --- HELPERS (Redirects & Parsing) ---

async function followRedirectsAndGetHtml(initialUrl) {
    try {
        const { data } = await axios.get(initialUrl, { headers });
        const regex = /(?:https:\/\/gamerxyt\.com\/)?hubcloud\.php\?[^"']+/g;
        const match = data.match(regex);
        
        if (match) {
            let bestMatch = match.reduce((a, b) => a.length > b.length ? a : b);
            if (!bestMatch.startsWith('http')) bestMatch = `https://gamerxyt.com/${bestMatch}`;
            console.log("↪️ [REDIRECT] Found JS Redirect to:", bestMatch);
            const { data: finalData } = await axios.get(bestMatch, { headers });
            return finalData;
        }
        return data;
    } catch (e) { throw e; }
}

function extractStreamsFromHtml(html, silent = false) {
    const $ = cheerio.load(html);
    let title = $("title").text().replace("(Movies4u.Foo)", "").trim();
    if (!title) title = "Unknown Title";

    if(!silent) console.log("ℹ️ Parsing HTML for Title:", title);

    const streams = [];

    const addStream = (name, link, type) => {
        if (!link || link === '#' || link === 'javascript:void(0)') return;
        
        if (link.includes("pixeldrain.com") || link.includes("pixeldrain.dev")) {
            link = link.replace("/u/", "/api/file/");
            name = "⚡ Pixeldrain (Fast)";
        }
        streams.push({ server: name, link: link, type: type });
    };

    // 1. Success Buttons (FSL)
    $(".btn-success").each((i, el) => {
        addStream(`⚡ Fast Cloud ${i + 1} (VIP)`, $(el).attr("href"), "DIRECT");
    });

    // 2. Danger Buttons (G-Direct)
    $(".btn-danger").each((i, el) => {
        addStream(`🚀 G-Direct ${i + 1} (10Gbps)`, $(el).attr("href"), "DRIVE");
    });

    // 3. Fallback
    if (streams.length === 0) {
        const rawMatch = html.match(/href=["'](https?:\/\/(?:drive\.google\.com|hubcloud\.run|workers\.dev|cdn\.fsl)[^"']+)["']/);
        if (rawMatch) addStream("Fast Server (Fallback)", rawMatch[1], "DIRECT");
    }

    // Filter Junk
    const cleanStreams = streams.filter(s => 
        !s.link.includes("dgdrive") && 
        !s.link.includes("login") && 
        !s.link.includes("plough")
    );

    if (cleanStreams.length === 0) {
        if(!silent) console.error("❌ NO valid streams found.");
        return { error: "No links found", title, streams: [] };
    } else {
        if(!silent) console.log(`✅ Extracted ${cleanStreams.length} valid streams.`);
    }

    return { source: "live", title, streams: cleanStreams };
}
