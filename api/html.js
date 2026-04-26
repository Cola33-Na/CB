export default async function handler(req, res) {
  const baseURL = process.env.WKY_API_9000 || 'http://bobbybase.ddns.net:9000';
  const apiKey = process.env.API_KEY || 'HKPL2024SecureKey';
  
  try {
    const response = await fetch(`${baseURL}/static-html`, {
      headers: { 
        'X-API-Key': apiKey,
        'Accept': 'text/html'
      }
    });
    
    if (!response.ok) throw new Error(`CasaOS HTTP ${response.status}`);
    const html = await response.text();
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    
  } catch (error) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!DOCTYPE html>
<html lang="zh-HK">
<head><meta charset="UTF-8"><title>HKPL 資料提取</title></head>
<body style="font-family:Microsoft YaHei;padding:20px;">
<h2>暫無資料</h2>
<p>請等待每日 09:00 自動更新，或確認 CasaOS 服務已啟動。</p>
<p style="color:#718096;font-size:12px;">錯誤: ${error.message}</p>
</body></html>`);
  }
}
