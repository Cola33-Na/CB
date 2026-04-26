// pages/api/proxy.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, target } = req.query;
  
  if (!target || !['8000', '8081', '9000'].includes(target)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid target port',
      detail: 'Allowed ports: 8000, 8081, 9000'
    });
  }

  let baseURL;
  if (target === '8000') {
    baseURL = process.env.WKY_API_8000 || 'http://bobbybase.ddns.net:8000';
  } else if (target === '8081') {
    baseURL = process.env.WKY_API_8081 || 'http://bobbybase.ddns.net:8081';
  } else if (target === '9000') {
    baseURL = process.env.WKY_API_9000 || 'http://bobbybase.ddns.net:9000';
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

    // ==================== 9000 電子資源 ====================
    if (target === '9000') {
      
      // 【新增】Excel 專用靜態 HTML（直接透傳，不解析 JSON）
      if (endpoint === 'static-html') {
        targetURL = `${baseURL}/static-html`;
        fetchOptions.method = 'GET';
        fetchOptions.headers = {
          'X-API-Key': apiKey,
          'Accept': 'text/html',
        };
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(targetURL, {
          ...fetchOptions,
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        const htmlContent = await response.text();
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(response.status).send(htmlContent);
      }
      
      if (endpoint === 'scrape') {
        targetURL = `${baseURL}/scrape`;
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify(req.body || {});
      } else if (endpoint === 'health') {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      } else {
        targetURL = `${baseURL}${endpoint ? '/' + endpoint : ''}`;
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          fetchOptions.body = JSON.stringify(req.body || {});
        }
      }
    }
    
    // ==================== 8081 圖書查詢 ====================
    else if (target === '8081') {
      if (endpoint && endpoint.startsWith('book/')) {
        targetURL = `${baseURL}/${endpoint}`;
        fetchOptions.method = 'GET';
      } else if (endpoint === 'health') {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      } else {
        targetURL = `${baseURL}${endpoint ? '/' + endpoint : ''}`;
      }
    }
    
    // ==================== 8000 爬蟲 ====================
    else if (target === '8000') {
      if (endpoint === 'scrape') {
        targetURL = `${baseURL}/scrape`;
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify({});
      } else {
        targetURL = `${baseURL}${endpoint ? '/' + endpoint : ''}`;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetURL, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const responseText = await response.text();
    let backendData;
    
    try {
      backendData = JSON.parse(responseText);
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        error: 'Invalid JSON response from backend',
        detail: responseText.substring(0, 500),
        target: target
      });
    }

    const isStandardFormat = (
      typeof backendData === 'object' && 
      backendData !== null &&
      'success' in backendData && 
      'data' in backendData &&
      typeof backendData.success === 'boolean'
    );

    if (isStandardFormat) {
      return res.status(response.status).json(backendData);
    } else {
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
      error: '連接 CasaOS 失敗',
      detail: error.message,
      type: errorType,
      target: target,
      timestamp: new Date().toISOString()
    });
  }
}
