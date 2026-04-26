// pages/api/proxy.js (或 app/api/proxy/route.js for Next.js 13+)

export default async function handler(req, res) {
  // 設置 CORS 頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, target } = req.query;
  
  // 【修改】加入 9000 到允許的 port 列表
  if (!target || !['8000', '8081', '9000'].includes(target)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid target port',
      detail: 'Allowed ports: 8000 (scraper), 8081 (book query), 9000 (ebook API)'
    });
  }

  // 從環境變量獲取配置
  let baseURL;
  if (target === '8000') {
    baseURL = process.env.WKY_API_8000 || process.env.HKPL_SCRAPER_URL;
  } else if (target === '8081') {
    baseURL = process.env.WKY_API_8081 || process.env.HKPL_BOOK_API_URL;
  } else if (target === '9000') {
    baseURL = process.env.WKY_API_9000 || process.env.HKPL_EBOOK_API_URL;
  }
  
  const apiKey = process.env.API_KEY || 'HKPL2024SecureKey';

  if (!baseURL) {
    return res.status(500).json({
      success: false,
      error: 'Server configuration error',
      detail: `Missing environment variable for target ${target}`
    });
  }

  try {
    let targetURL;
    let fetchOptions = {
      method: req.method,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    // 根據目標和端點構造請求
    if (target === '8000') {
      // API 1: 爬蟲服務 (Port 8000)
      if (endpoint === 'scrape') {
        targetURL = `${baseURL}/scrape`;
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify({});
      } else if (endpoint === 'scrape-simple') {
        targetURL = `${baseURL}/scrape-simple`;
        fetchOptions.method = 'POST';
      } else if (endpoint === 'health') {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      } else {
        targetURL = `${baseURL}${endpoint ? '/' + endpoint : ''}`;
      }
    } else if (target === '8081') {
      // API 2: 圖書查詢服務 (Port 8081)
      if (endpoint && endpoint.startsWith('book/')) {
        targetURL = `${baseURL}/${endpoint}`;
        fetchOptions.method = 'GET';
        console.log(`[Proxy] Book query: ${endpoint}`);
      } else if (endpoint === 'check' || endpoint === 'PublicCheckStatus') {
        targetURL = `${baseURL}/PublicCheckStatus`;
        fetchOptions.method = 'POST';
        const { ph } = req.body || {};
        fetchOptions.body = JSON.stringify({ ph });
      } else if (endpoint === 'health') {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      } else {
        targetURL = `${baseURL}${endpoint ? '/' + endpoint : ''}`;
      }
    } else if (target === '9000') {
      // 【新增】API 3: 電子資源抓取服務 (Port 9000)
      if (endpoint === 'scrape') {
        targetURL = `${baseURL}/scrape`;
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify(req.body || {});
      } else if (endpoint === 'health') {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      } else {
        // 默認透傳，保留原始 HTTP 方法
        targetURL = `${baseURL}${endpoint ? '/' + endpoint : ''}`;
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          fetchOptions.body = JSON.stringify(req.body || {});
        }
      }
      console.log(`[Proxy] Ebook API: ${fetchOptions.method} ${targetURL}`);
    }

    // 超時控制 (30秒)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    console.log(`[Proxy] ${fetchOptions.method} ${targetURL}`);
    
    // 發送請求到 CasaOS
    const response = await fetch(targetURL, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    // 解析後端響應
    const responseText = await response.text();
    let backendData;
    
    try {
      backendData = JSON.parse(responseText);
      console.log(`[Proxy] Response from ${target}:`, JSON.stringify(backendData).substring(0, 200) + '...');
    } catch (parseError) {
      console.error('[Proxy] JSON parse error:', parseError);
      return res.status(502).json({
        success: false,
        error: 'Invalid JSON response from backend',
        detail: responseText.substring(0, 500),
        target: target
      });
    }

    // 智能透傳邏輯
    const isStandardFormat = (
      typeof backendData === 'object' && 
      backendData !== null &&
      'success' in backendData && 
      'data' in backendData &&
      typeof backendData.success === 'boolean'
    );

    if (isStandardFormat) {
      console.log('[Proxy] Passing through standard format response');
      if (process.env.NODE_ENV !== 'production') {
        backendData._proxy = {
          target: target,
          endpoint: endpoint,
          timestamp: new Date().toISOString()
        };
      }
      return res.status(response.status).json(backendData);
    } else {
      // 非標準格式（直接是書籍對象或電子資源數據），需要包裝
      console.log('[Proxy] Wrapping non-standard response');
      return res.status(response.status).json({
        success: response.ok,
        data: backendData,
        _meta: {
          target: target,
          endpoint: endpoint,
          timestamp: new Date().toISOString(),
          wrapped: true
        }
      });
    }

  } catch (error) {
    console.error('[Proxy] Error:', error);
    
    let statusCode = 500;
    let errorType = 'Unknown Error';
    
    if (error.name === 'AbortError') {
      statusCode = 504;
      errorType = 'Gateway Timeout';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      statusCode = 503;
      errorType = 'Service Unavailable';
    }
    
    return res.status(statusCode).json({
      success: false,
      error: '連接玩客雲失敗',
      detail: error.message,
      type: errorType,
      target: target,
      timestamp: new Date().toISOString()
    });
  }
}
