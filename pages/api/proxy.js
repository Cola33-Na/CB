// pages/api/proxy.js — 最小測試版
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { target, endpoint } = req.query;

  return res.status(200).json({
    ok: true,
    message: 'Proxy route is working',
    received: { target, endpoint, method: req.method },
    env: {
      wky_9000: process.env.WKY_API_9000 ? '已設定' : '未設定',
      wky_8081: process.env.WKY_API_8081 ? '已設定' : '未設定',
      api_key: process.env.API_KEY ? '已設定' : '未設定'
    }
  });
}
