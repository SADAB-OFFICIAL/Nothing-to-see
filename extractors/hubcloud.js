const cheerio = require("cheerio");
const axios = require("axios");
const headers = require("../headers");

// --- CONFIGURATION ---
const TOKEN_SOURCE = "https://vcloud.zip/hr17ehaeym7rza9";
const BASE_GAMER_URL = "https://gamerxyt.com/hubcloud.php";

// --- 1. TOKEN EXTRACTOR (Debug Mode) ---
async function getFreshToken() {
    try {
        console.log("🔄 [TOKEN] Generating Fresh Token...");
        const target = `${TOKEN_SOURCE}?t=${Date.now()}`;
        
        const { data } = await axios.get(target, { 
            headers: { ...headers, "Cache-Control": "no-cache" } 
        });

        const match = data.match(/token=([^&"'\s<>]+)/);
        if (match) {
            console.log("✅ [TOKEN] Extracted:", match[1].substring(0, 10) + "...");
            return match[1];
        } else {
            console.error("❌ [TOKEN] Regex Failed. Response Preview:", data.substring(0, 200));
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
        console.log("\n🚀 [START] Processing HubCloud URL:", url);
        
        // Step 1: HubCloud Page Load
        console.log("⏳ [STEP 1] Fetching HubCloud Page...");
        const { data: hubData } = await axios.get(url, { headers });
        const $ = cheerio.load(hubData);
        
        const hubId = url.split('/').pop();
        console.log("ℹ️ [INFO] Extracted HubID:", hubId);

        // Try Direct Method
        const vCloudLink = $('a:contains("Download"), a:contains("View")').attr("href");
        console.log("ℹ️ [INFO] Found Direct vCloud Link:", vCloudLink || "NONE");

        // --- TOKEN SYSTEM ACTIVATION ---
        console.log("🛡️ [STEP 2] Activating Token Bypass System...");
        const token = await getFreshToken();
        
        if (!token) throw new Error("Token generation failed");

        // Construct GamerXYT Link
        const magicUrl = `${BASE_GAMER_URL}?host=hubcloud&id=${hubId}&token=${token}`;
        console.log("🔗 [STEP 3] Generated Magic URL:", magicUrl);

        // Step 4: Scrape the Magic URL
        console.log("⏳ [STEP 4] Scraping Magic URL & Following Redirects...");
        const finalPageHtml = await followRedirectsAndGetHtml(magicUrl);
        
        if (!finalPageHtml) {
             throw new Error("Final Page HTML was empty or null");
        }

        console.log("✅ [STEP 5] Parsing Final HTML for Streams...");
        return extractStreamsFromHtml(finalPageHtml);

    } catch (e) {
        console.error("❌ [CRITICAL ERROR]:", e.message);
        if (e.response) {
            console.error("   > Status:", e.response.status);
            console.error("   > Headers:", JSON.stringify(e.response.headers));
        }
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
        } else {
            console.log("ℹ️ [INFO] No JS Redirect found, assuming current page is Final.");
            return data;
        }
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

    // Debug: Check if buttons exist
    const successBtns = $(".btn-success").length;
    const dangerBtns = $(".btn-danger").length;
    console.log(`ℹ️ [INFO] Buttons Found -> Success: ${successBtns}, Danger: ${dangerBtns}`);

    $(".btn-success").each((_, el) => {
        streams.push({ server: "⚡ Fast Cloud (VIP)", link: $(el).attr("href"), type: "DIRECT" });
    });

    $(".btn-danger").each((_, el) => {
        streams.push({ server: "🚀 G-Direct (10Gbps)", link: $(el).attr("href"), type: "DRIVE" });
    });
    
    // Fallback: Check raw links
    if (streams.length === 0) {
        console.log("⚠️ [WARN] No buttons found, searching for Raw Links...");
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
