const cheerio = require("cheerio");
const axios = require("axios");
const headers = require("../headers");

// --- CONFIGURATION ---
const TOKEN_SOURCE = "https://vcloud.zip/hr17ehaeym7rza9";
const BASE_GAMER_URL = "https://gamerxyt.com/hubcloud.php";

async function getFreshToken() {
    try {
        console.log("🔄 [TOKEN] Generating Fresh Token...");
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

module.exports = async function (url) {
    try {
        console.log("\n🚀 [START] Processing HubCloud URL (Direct Bypass):", url);
        
        // Step 1: ID Nikalna
        const hubId = url.split('/').pop();
        if (!hubId) throw new Error("Invalid HubCloud URL");

        // Step 2: Token Generate Karna
        const token = await getFreshToken();
        if (!token) throw new Error("Token generation failed");

        // Step 3: Magic URL Banana
        const magicUrl = `${BASE_GAMER_URL}?host=hubcloud&id=${hubId}&token=${token}`;
        console.log("🔗 [STEP 3] Generated Magic URL:", magicUrl);

        // Step 4: Magic URL ko Scrape Karna
        console.log("⏳ [STEP 4] Scraping Magic URL & Following Redirects...");
        const finalPageHtml = await followRedirectsAndGetHtml(magicUrl);
        
        if (!finalPageHtml) throw new Error("Final Page HTML was empty");

        console.log("✅ [STEP 5] Parsing Final HTML...");
        return extractStreamsFromHtml(finalPageHtml);

    } catch (e) {
        console.error("❌ [CRITICAL ERROR]:", e.message);
        return { error: "Failed to extract links" };
    }
};

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

function extractStreamsFromHtml(html) {
    const $ = cheerio.load(html);
    let title = $("title").text().replace("(Movies4u.Foo)", "").trim();
    if (!title) title = "Unknown Title";

    const streams = [];

    // Helper to process link
    const addStream = (name, link, type) => {
        if (!link || link === '#' || link === 'javascript:void(0)') return;
        
        // Clean Pixeldrain Links
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

    // 3. Fallback: Raw Links
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
        console.error("❌ [ERROR] NO valid streams found.");
    } else {
        console.log(`✅ [SUCCESS] Extracted ${cleanStreams.length} valid streams.`);
    }

    return { source: "live", title, streams: cleanStreams };
}
