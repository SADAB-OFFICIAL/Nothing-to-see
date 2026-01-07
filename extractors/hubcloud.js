const cheerio = require("cheerio");
const axios = require("axios");
const headers = require("../headers");

// --- CONFIGURATION ---
const TOKEN_SOURCE = "https://vcloud.zip/hr17ehaeym7rza9";
const BASE_GAMER_URL = "https://gamerxyt.com/hubcloud.php";

// --- 1. TOKEN EXTRACTOR ---
async function getFreshToken() {
    try {
        console.log("🔄 [TOKEN] Generating Fresh Token...");
        // Random timestamp to avoid caching
        const target = `${TOKEN_SOURCE}?t=${Date.now()}`;
        
        const { data } = await axios.get(target, { 
            headers: { ...headers, "Cache-Control": "no-cache" } 
        });

        // Regex se token nikalna
        const match = data.match(/token=([^&"'\s<>]+)/);
        if (match) {
            console.log("✅ [TOKEN] Extracted:", match[1].substring(0, 10) + "...");
            return match[1];
        } else {
            console.error("❌ [TOKEN] Failed to extract token.");
            return null;
        }
    } catch (e) {
        console.error("❌ [TOKEN] Network Error:", e.message);
        return null;
    }
}

// --- 2. MAIN EXTRACTOR ---
module.exports = async function (url) {
    try {
        console.log("\n🚀 [START] Processing HubCloud URL (Direct Bypass):", url);
        
        // Step 1: ID Nikalna (URL se seedha)
        // HubCloud page load karne ki zaroorat nahi hai (Cloudflare bypass)
        const hubId = url.split('/').pop();
        console.log("ℹ️ [INFO] Extracted HubID:", hubId);

        if (!hubId) throw new Error("Invalid HubCloud URL");

        // Step 2: Token Generate Karna
        const token = await getFreshToken();
        if (!token) throw new Error("Token generation failed");

        // Step 3: Magic URL Banana
        // host=hubcloud & id={HUB_ID} & token={TOKEN}
        const magicUrl = `${BASE_GAMER_URL}?host=hubcloud&id=${hubId}&token=${token}`;
        console.log("🔗 [STEP 3] Generated Magic URL:", magicUrl);

        // Step 4: Magic URL ko Scrape Karna
        // GamerXYT usually blocks bots less aggressively than HubCloud
        console.log("⏳ [STEP 4] Scraping Magic URL & Following Redirects...");
        const finalPageHtml = await followRedirectsAndGetHtml(magicUrl);
        
        if (!finalPageHtml) {
             throw new Error("Final Page HTML was empty");
        }

        console.log("✅ [STEP 5] Parsing Final HTML...");
        return extractStreamsFromHtml(finalPageHtml);

    } catch (e) {
        console.error("❌ [CRITICAL ERROR]:", e.message);
        return { error: "Failed to extract links", details: e.message };
    }
};

// --- HELPERS ---

async function followRedirectsAndGetHtml(initialUrl) {
    try {
        const { data } = await axios.get(initialUrl, { headers });
        
        // Check for JS Redirect "hubcloud.php?"
        const regex = /(?:https:\/\/gamerxyt\.com\/)?hubcloud\.php\?[^"']+/g;
        const match = data.match(regex);
        
        if (match) {
            let bestMatch = match.reduce((a, b) => a.length > b.length ? a : b);
            if (!bestMatch.startsWith('http')) bestMatch = `https://gamerxyt.com/${bestMatch}`;
            
            console.log("↪️ [REDIRECT] Found JS Redirect to:", bestMatch);
            const { data: finalData } = await axios.get(bestMatch, { headers });
            return finalData;
        }
        
        return data; // No redirect found, assume this is the page
    } catch (e) {
        console.error("❌ [REDIRECT ERROR]:", e.message);
        throw e;
    }
}

function extractStreamsFromHtml(html) {
    const $ = cheerio.load(html);
    let title = $("title").text().replace("(Movies4u.Foo)", "").trim();
    if (!title) title = "Unknown Title";

    console.log("ℹ️ [INFO] Page Title Extracted:", title);

    const streams = [];

    // 1. Success Buttons (FSL)
    $(".btn-success").each((_, el) => {
        streams.push({ server: "⚡ Fast Cloud (VIP)", link: $(el).attr("href"), type: "DIRECT" });
    });

    // 2. Danger Buttons (G-Direct)
    $(".btn-danger").each((_, el) => {
        streams.push({ server: "🚀 G-Direct (10Gbps)", link: $(el).attr("href"), type: "DRIVE" });
    });

    // 3. Fallback: Raw Links
    if (streams.length === 0) {
        const rawMatch = html.match(/href=["'](https?:\/\/(?:drive\.google\.com|hubcloud\.run|workers\.dev|cdn\.fsl)[^"']+)["']/);
        if (rawMatch) {
            console.log("✅ [INFO] Found Raw Link:", rawMatch[1]);
            streams.push({ server: "Fast Server (Fallback)", link: rawMatch[1], type: "DIRECT" });
        }
    }

    if (streams.length === 0) {
        console.error("❌ [ERROR] Parsing finished but NO streams found.");
    } else {
        console.log(`✅ [SUCCESS] Extracted ${streams.length} streams.`);
    }

    return { title, streams };
}
