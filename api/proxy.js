export default async function handler(req, res) {
  // CORS 設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, target } = req.query;
  
  if (!target || !['8000', '8081'].includes(target)) {
    return res.status(400).json({ error: 'Invalid target port. Use 8000 or 8081' });
  }

  // 環境變數檢查
  const baseURL = target === '8000' 
    ? process.env.WKY_API_8000 
    : process.env.WKY_API_8081;
  
  const apiKey = process.env.API_KEY;

  if (!baseURL) {
    console.error(`[API] 環境變數未設定: WKY_API_${target}`);
    return res.status(500).json({ 
      success: false, 
      error: `Server config error: WKY_API_${target} not set` 
    });
  }

  if (!apiKey) {
    console.error('[API] 環境變數未設定: API_KEY');
    return res.status(500).json({ 
      success: false, 
      error: 'Server config error: API_KEY not set' 
    });
  }

  try {
    let targetURL;
    let fetchOptions = {
      method: req.method,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    };

    // 根據目標構造請求
    if (target === '8000') {
      // Python 爬蟲 API
      if (endpoint === 'scrape') {
        targetURL = `${baseURL}/scrape`;
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify({});
      } else if (endpoint === 'scrape-simple') {
        targetURL = `${baseURL}/scrape-simple`;
        fetchOptions.method = 'POST';
      } else {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      }
    } else {
      // 8081 圖書查詢 API
      if (endpoint === 'check') {
        targetURL = `${baseURL}/PublicCheckStatus`;
        fetchOptions.method = 'POST';
        const { ph } = req.body || {};
        fetchOptions.body = JSON.stringify({ ph });
      } else {
        targetURL = `${baseURL}/health`;
        fetchOptions.method = 'GET';
      }
    }

    console.log(`[API] 轉發請求: ${fetchOptions.method} ${targetURL}`);

    // 發送請求到玩客雲
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetURL, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    // 檢查 HTTP 狀態
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] 玩客雲返回錯誤: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        success: false,
        error: `Target server error: ${response.status}`,
        detail: errorText,
      });
    }

    // 解析 JSON（帶錯誤處理）
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      const rawText = await response.text();
      console.error('[API] JSON 解析失敗:', parseError);
      console.error('[API] 原始回應:', rawText.substring(0, 200));
      return res.status(500).json({
        success: false,
        error: 'Invalid JSON response from target server',
        detail: rawText.substring(0, 200),
      });
    }

    console.log(`[API] 玩客雲返回結構:`, {
      hasSuccess: 'success' in data,
      hasData: 'data' in data,
      dataType: typeof data.data,
      ebooksCount: data.data?.ebooks?.length || 0,
      databasesCount: data.data?.edatabases?.length || 0,
    });

    // 關鍵轉換：將玩客雲的 data.data 提升到頂層
    // 玩客雲結構: { success: true, data: { ebooks, edatabases, totals } }
    let responseData;
    
    if (data.data && (data.data.ebooks || data.data.edatabases)) {
      // 標準結構：data 欄位包含 ebooks
      responseData = {
        success: data.success !== undefined ? data.success : true,
        ebooks: data.data.ebooks || [],
        edatabases: data.data.edatabases || [],
        total_ebooks: data.data.total_ebooks || data.data.ebooks?.length || 0,
        total_databases: data.data.total_databases || data.data.edatabases?.length || 0,
        _proxy: {
          target: target,
          endpoint: endpoint || 'default',
          timestamp: new Date().toISOString(),
          source: 'structured'
        }
      };
    } else if (data.ebooks || data.edatabases) {
      // 已經是扁平結構（直接從玩客雲返回）
      responseData = {
        ...data,
        _proxy: {
          target: target,
          endpoint: endpoint || 'default',
          timestamp: new Date().toISOString(),
          source: 'flat'
        }
      };
    } else {
      // 無法識別的結構，返回原始數據
      console.warn('[API] 無法識別的數據結構:', Object.keys(data));
      responseData = {
        success: false,
        error: 'Unrecognized data structure from target',
        rawData: data,
        _proxy: {
          target: target,
          timestamp: new Date().toISOString(),
          source: 'unknown'
        }
      };
    }

    // 確保陣列存在（防呆）
    if (!Array.isArray(responseData.ebooks)) responseData.ebooks = [];
    if (!Array.isArray(responseData.edatabases)) responseData.edatabases = [];

    console.log(`[API] 最終返回: ${responseData.ebooks.length} 本電子書, ${responseData.edatabases.length} 個資料庫`);

    res.status(200).json(responseData);

  } catch (error) {
    console.error('[API] 執行錯誤:', error);
    
    // 區分錯誤類型
    let errorMessage = 'Internal server error';
    let statusCode = 500;

    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout (30s)';
      statusCode = 504;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = `Connection refused to ${target === '8000' ? 'Python API' : 'Book API'}`;
      statusCode = 503;
    } else if (error.message && error.message.includes('fetch failed')) {
      errorMessage = `Cannot connect to target server at ${target === '8000' ? process.env.WKY_API_8000 : 'WKY_API_8081'}`;
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      detail: error.message,
      target: target,
    });
  }
}
