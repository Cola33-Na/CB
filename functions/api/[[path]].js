export async function onRequest(context) {
  const { request, env, ctx } = context;
  
  const GAS_URL = env.GAS_URL;
  const url = new URL(request.url);
  const targetUrl = new URL(GAS_URL);
  
  const path = url.pathname.replace('/api', '') || '/';
  targetUrl.pathname = path;
  targetUrl.search = url.search;
  
  // 快取檢查（略，同上）
  
  // 模擬瀏覽器 headers
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Referer': 'https://www.google.com/',
    'Origin': 'https://www.google.com',
  };
  
  // 嘗試請求，最多重試 3 次
  let lastError = null;
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      // 延遲 1 秒後重試
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    try {
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: browserHeaders,
        body: request.body,
      });
      
      const response = await fetch(modifiedRequest);
      
      // 如果不是 429，直接回傳
      if (response.status !== 429) {
        // 處理成功回應（略，同上）
        const newResponse = new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        return newResponse;
      }
      
      // 記錄 429 錯誤
      lastError = response.status;
      
    } catch (error) {
      lastError = error.message;
    }
  }
  
  // 重試都失敗，回傳錯誤
  return new Response(JSON.stringify({
    success: false,
    error: 'Google 暫時阻擋了請求，請 30 秒後再試',
    detail: 'Cloudflare IP 被 Google 識別為自動化流量'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
