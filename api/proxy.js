// Serverless proxy for OpenFood Facts API
// Bypasses CORS by making requests server-side

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      if (response.status === 503 && attempt < maxRetries) {
        console.log(`[PROXY] Got 503, retrying (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // exponential backoff
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`[PROXY] Error on attempt ${attempt}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw error;
    }
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Validate it's an OpenFood Facts URL
    if (!url.includes('openfoodfacts.org')) {
      return res.status(400).json({ error: 'Only OpenFood Facts URLs allowed' });
    }

    console.log('[PROXY] Fetching:', url);

    // Fetch with retry logic
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      console.log('[PROXY] Bad response:', response.status, response.statusText);
      return res.status(response.status).json({ error: `OFF returned ${response.status}` });
    }

    const data = await response.json();
    console.log('[PROXY] Success, returning data');

    res.status(200).json(data);
  } catch (error) {
    console.error('[PROXY] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
