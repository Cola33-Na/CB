// pages/api/proxy.js — 完整版（支援 8000/8081/9000 + HTML 表格輸出）
export default async function handler(req, res) {
  // 設置 CORS 頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, target } = req.query;
  
  // 驗證 target
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

    // ==================== 新增：HTML 表格端點 ====================
    if (target === '9000' && endpoint === 'html') {
      targetURL = `${baseURL}/scrape`;
      fetchOptions.method = 'POST';
      fetchOptions.body = JSON.stringify(req.body || {});
      
      console.log(`[Proxy] Generating HTML table from ${targetURL}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(targetURL, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseText = await response.text();
      let backendData;
      try { backendData = JSON.parse(responseText); }
      catch (e) {
        return res.status(502).json({
          success: false,
          error: 'Invalid JSON response from backend',
          detail: responseText.substring(0, 500)
        });
      }

      const data = backendData.data || backendData;
      const ebooks = data.ebooks || [];
      const databases = data.edatabases || [];
      const total = ebooks.length + databases.length;
      const now = new Date().toLocaleString('zh-HK');

      const esc = (s) => {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      };

      let rows = '';
      ebooks.forEach(item => {
        rows += `<tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc(item.category || '電子書')}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${esc(item.title)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;">${esc(item.link)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc(item.category || '電子書')}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc(item.description)}</td>
        </tr>`;
      });
      databases.forEach(item => {
        rows += `<tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;"><span style="padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;background:#dbeafe;color:#1e40af;">資料庫</span></td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${esc(item.title)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;">${esc(item.link)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc((item.locations || []).join('; '))}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc((item.tags || []).join('; '))}</td>
        </tr>`;
      });

      const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8">
<title>HKPL 靜態資料 - ${now}</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",Arial,sans-serif;padding:20px;color:#2d3748;background:#f7fafc;}
h1{font-size:18px;margin-bottom:6px;}
.meta{color:#92400e;font-size:12px;margin-bottom:12px;padding:8px 12px;background:#fef3c7;border-radius:4px;border-left:3px solid #f59e0b;}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);}
th{background:#f0fff4;padding:10px 12px;text-align:left;font-weight:700;color:#22543d;border:1px solid #c6f6d5;}
td{padding:8px 12px;border:1px solid #e2e8f0;vertical-align:top;}
tr:hover{background:#f8fafc;}
a{color:#667eea;text-decoration:none;}
</style>
</head>
<body>
<h1>HKPL 電子資源資料</h1>
<div class="meta">📅 更新時間：${now} | 共 ${total} 筆（電子書 ${ebooks.length} + 資料庫 ${databases.length}）<br>本頁面為純靜態 HTML，可直接用 Excel「資料 → 從 Web」提取</div>
<table>
<thead><tr><th style="width:80px;">類型</th><th style="width:240px;">標題</th><th style="width:220px;">連結</th><th style="width:180px;">分類/地點</th><th>說明/標籤</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }
    // ==================== 原有邏輯不變 ====================

    if (target === '8000') {
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
