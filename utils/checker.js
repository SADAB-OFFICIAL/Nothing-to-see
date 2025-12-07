const axios = require('axios');

const checkHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Connection': 'keep-alive',
    'Range': 'bytes=0-100' // Fast Check
};

async function checkStreams(streams) {
    if (!streams || streams.length === 0) return [];

    console.log(`🚦 Checking health of ${streams.length} links...`);

    const checkPromises = streams.map(async (stream) => {
        try {
            // Google/Worker links ko skip karo (False Positive se bachne ke liye)
            if (stream.link.includes('googleusercontent') || stream.link.includes('workers.dev')) {
                return stream; 
            }

            await axios.head(stream.link, { 
                headers: checkHeaders, 
                timeout: 3500 
            });

            return stream;

        } catch (error) {
            // Sirf confirm dead links ko hatao
            if (error.response && (error.response.status === 404 || error.response.status === 410)) {
                console.log(`💀 REMOVED Dead Link (404): ${stream.server}`);
                return null;
            }
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                console.log(`💀 REMOVED Server Down: ${stream.server}`);
                return null;
            }
            // 403 Forbidden ko allow karo (Browser mein chal sakta hai)
            return stream; 
        }
    });

    const results = await Promise.all(checkPromises);
    return results.filter(s => s !== null);
}

module.exports = checkStreams;
