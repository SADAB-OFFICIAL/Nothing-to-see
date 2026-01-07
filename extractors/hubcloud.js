const cheerio = require("cheerio");
const axios = require("axios");
const headers = require("../headers");

// --- CONFIGURATION ---
const TOKEN_SOURCE = "https://vcloud.zip/hr17ehaeym7rza9";
const PROXY_URL = "https://proxy.vlyx.workers.dev"; // Agar proxy chahiye to use karein
const BASE_GAMER_URL = "https://gamerxyt.com/hubcloud.php";

// --- 1. TOKEN EXTRACTOR (Magic Logic) ---
async function getFreshToken() {
    try {
        console.log("🔄 Generating Fresh Token...");
        // Random timestamp to avoid caching
        const target = `${TOKEN_SOURCE}?t=${Date.now()}`;
        
        // Direct fetch ya Proxy ke through
        const { data } = await axios.get(target, { 
            headers: { ...headers, "Cache-Control": "no-cache" } 
        });

        // Regex se token nikalna
        const match = data.match(/token=([^&"'\s<>]+)/);
        return match ? match[1] : null;
    } catch (e) {
        console.error("Token Error:", e.message);
        return null;
    }
}

// --- 2. MAIN EXTRACTOR ---
module.exports = async function (url) {
    try {
        console.log("🔍 Processing HubCloud:", url);
        
        // Step 1: HubCloud Page Load
        const { data: hubData } = await axios.get(url, { headers });
        const $ = cheerio.load(hubData);
        
        // ID Nikalna (URL se)
        // https://hubcloud.run/drive/xyz123 -> xyz123
        const hubId = url.split('/').pop();

        // Step 2: Try Direct Method First (Current Logic)
        const vCloudLink = $('a:contains("Download"), a:contains("View")').attr("href");
        
        if (vCloudLink) {
            console.log("✅ Found vCloud Link, trying direct scrape...");
            try {
                const result = await scrapeFinalLinks(vCloudLink);
                if (result.streams.length > 0) return result;
            } catch (err) {
                console.log("⚠️ Direct scrape failed, switching to Token System...");
            }
        }

        // Step 3: FALLBACK - Token System (Agar direct fail ho ya link na mile)
        console.log("🛡️ Activating Token Bypass...");
        const token = await getFreshToken();
        
        if (!token) throw new Error("Failed to generate token");

        // Construct GamerXYT Link
        // host=hubcloud & id={HUB_ID} & token={TOKEN}
        const magicUrl = `${BASE_GAMER_URL}?host=hubcloud&id=${hubId}&token=${token}`;
        console.log("🔗 Generated Magic URL:", magicUrl);

        // Step 4: Scrape the Magic URL (Redirection Handling)
        // GamerXYT redirects check karne padenge
        const finalPageHtml = await followRedirectsAndGetHtml(magicUrl);
        return extractStreamsFromHtml(finalPageHtml);

    } catch (e) {
        console.error("HubCloud Extractor Error:", e.message);
        return { error: "Failed to extract links" };
    }
};

// --- HELPERS ---

// Helper: Final Page tak pahunchna (Redirects handle karna)
async function followRedirectsAndGetHtml(initialUrl) {
    try {
        // GamerXYT aksar JS redirection use karta hai, to humein 'verified' link dhoondna hoga
        const { data } = await axios.get(initialUrl, { headers });
        
        // Check for "hubcloud.php?" link inside HTML (Tokenized Redirect)
        const regex = /(?:https:\/\/gamerxyt\.com\/)?hubcloud\.php\?[^"']+/g;
        const match = data.match(regex);
        
        let targetUrl = initialUrl;
        if (match) {
            // Sabse lamba link usually sahi hota hai
            let bestMatch = match.reduce((a, b) => a.length > b.length ? a : b);
            if (!bestMatch.startsWith('http')) bestMatch = `https://gamerxyt.com/${bestMatch}`;
            targetUrl = bestMatch;
        }

        console.log("🚀 Scraping Final Page:", targetUrl);
        const { data: finalData } = await axios.get(targetUrl, { headers });
        return finalData;

    } catch (e) {
        throw e;
    }
}

// Helper: HTML se Links nikalna (Common Logic)
async function scrapeFinalLinks(url) {
    const { data } = await axios.get(url, { headers });
    return extractStreamsFromHtml(data);
}

function extractStreamsFromHtml(html) {
    const $ = cheerio.load(html);
    const title = $("title").text().replace("(Movies4u.Foo)", "").trim();
    const streams = [];

    // 1. Direct Links (FSL/Fast)
    $(".btn-success").each((_, el) => {
        streams.push({ server: "⚡ Fast Cloud (VIP)", link: $(el).attr("href"), type: "DIRECT" });
    });

    // 2. G-Direct (Drive)
    $(".btn-danger").each((_, el) => {
        streams.push({ server: "🚀 G-Direct (10Gbps)", link: $(el).attr("href"), type: "DRIVE" });
    });

    // 3. Mirrors
    $(".btn-primary, .btn-warning, .btn-info").each((_, el) => {
        let name = $(el).text().trim();
        if(name.toLowerCase().includes('download')) name = "Mirror Server";
        streams.push({ server: name, link: $(el).attr("href"), type: "MIRROR" });
    });

    // Filter Junk
    const cleanStreams = streams.filter(s => 
        !s.link.includes("dgdrive") && 
        !s.link.includes("login") &&
        !s.link.includes("plough")
    );

    return { title, streams: cleanStreams };
}
