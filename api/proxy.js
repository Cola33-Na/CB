export default async function handler(req, res) {
  // CORS 設定（保持不變）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, target } = req.query;
  
  if (!target || !['8000', '8081'].includes(target)) {
    return res.status(400).json({ error: 'Invalid target port' });
  }

  const baseURL = target === '8000' 
    ? process.env.WKY_API_8000 
    : process.env.WKY_API_8081;
  
  const apiKey = process.env.API_KEY;

  try {
    let targetURL;
    let options = {
      method: req.method,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    };

    // URL 建構邏輯（保持不變）
    if (target === '8000') {
      if (endpoint === 'scrape') {
        targetURL = `${baseURL}/scrape`;
        options.method = 'POST';
        options.body = JSON.stringify({});
      } else if (endpoint === 'scrape-simple') {
        targetURL = `${baseURL}/scrape-simple`;
        options.method = 'POST';
      } else {
        targetURL = `${baseURL}/health`;
        options.method = 'GET';
      }
    } else {
      if (endpoint === 'check') {
        targetURL = `${baseURL}/PublicCheckStatus`;
        options.method = 'POST';
        const { ph } = req.body || {};
        options.body = JSON.stringify({ ph });
      } else {
        targetURL = `${baseURL}/health`;
        options.method = 'GET';
      }
    }

    // 發送請求
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetURL, {
      ...options,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    const data = await response.json();
    
    // ✅ 關鍵修正：展開 data.data，讓前端直接取得 ebooks/edatabases
    res.status(response.status).json({
      ...data.data,  // 這裡才是電子書和資料庫數組！
      success: data.success,
      _proxy: {
        target: target,
        endpoint: endpoint,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: '連接玩客雲失敗',
      detail: error.message,
      target: target,
    });
  }
}
