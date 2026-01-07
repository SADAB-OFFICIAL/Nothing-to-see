const cheerio = require("cheerio");
const axios = require("axios");
const headers = require("../headers");

// --- CONFIGURATION ---
const TOKEN_SOURCE = "https://vcloud.zip/hr17ehaeym7rza9";
const BASE_GAMER_URL = "https://gamerxyt.com/hubcloud.php";

// --- HELPER: Token Generator (Only for HubCloud) ---
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

// --- MAIN EXTRACTOR ---
module.exports = async function (url) {
    try {
        console.log("\n🚀 [START] Processing URL:", url);

        // ---------------------------------------------------------
        // 🛑 LOGIC 1: HUBCLOUD (Use Token System - Bypass CF)
        // ---------------------------------------------------------
        if (url.includes("hubcloud") || url.includes("hubdrive")) {
            console.log("🛡️ Mode: HubCloud Detected (Activating Token Bypass)");
            
            // Step 1: ID Nikalna
            const hubId = url.split('/').pop();
            if (!hubId) throw new Error("Invalid HubCloud URL");

            // Step 2: Token Generate Karna
            const token = await getFreshToken();
            if (!token) throw new Error("Token generation failed");

            // Step 3: Magic URL Banana
            const magicUrl = `${BASE_GAMER_URL}?host=hubcloud&id=${hubId}&token=${token}`;
            console.log("🔗 Generated Magic URL:", magicUrl);

            // Step 4: Scrape Magic URL
            const finalPageHtml = await followRedirectsAndGetHtml(magicUrl);
            return extractStreamsFromHtml(finalPageHtml);
        } 
        
        // ---------------------------------------------------------
        // 🟢 LOGIC 2: V-CLOUD (Use Old Direct Scraper - No Token Needed)
        // ---------------------------------------------------------
        else {
            console.log("⚡ Mode: V-Cloud Detected (Direct Scraping)");
            
            // Step 1: Direct Page Load
            const { data: vCloudData } = await axios.get(url, { headers });
            const $ = cheerio.load(vCloudData);
            
            // Check: Agar ye pehle se final page hai (Streams hain)
            if ($(".btn-success").length > 0 || $(".btn-danger").length > 0) {
                console.log("✅ Streams found directly on V-Cloud page!");
                return extractStreamsFromHtml(vCloudData);
            }

            // Check: Agar ye redirect page hai (Old Logic: Find 'Download' link)
            // Aksar V-Cloud ek intermediate page deta hai jahan "Download" click karna padta hai
            const nextLink = $('a:contains("Download"), a:contains("View"), a.btn').attr("href");

            if (nextLink) {
                console.log("↪️ Found Redirect Link inside V-Cloud:", nextLink);
                // Us link ko follow karo
                const { data: finalData } = await axios.get(nextLink, { headers });
                return extractStreamsFromHtml(finalData);
            } else {
                // Agar kuch nahi mila, to shayad ye direct GamerXYT structure hai
                console.log("ℹ️ No redirects found, parsing current page as final...");
                return extractStreamsFromHtml(vCloudData);
            }
        }

    } catch (e) {
        console.error("❌ [CRITICAL ERROR]:", e.message);
        return { error: "Failed to extract links" };
    }
};

// --- HELPERS ---

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

// Common Extraction Logic (Dono modes ke liye same)
function extractStreamsFromHtml(html) {
    const $ = cheerio.load(html);
    let title = $("title").text().replace("(Movies4u.Foo)", "").trim();
    if (!title) title = "Unknown Title";

    console.log("ℹ️ Page Title:", title);

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
        console.error("❌ NO valid streams found.");
        return { error: "No links found", title };
    } else {
        console.log(`✅ Extracted ${cleanStreams.length} valid streams.`);
    }

    return { source: "live", title, streams: cleanStreams };
}
