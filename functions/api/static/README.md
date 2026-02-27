# Cloudflare Pages + Google Apps Script Proxy

使用 Cloudflare Pages 免費版隱藏 GAS 原始網址。

## 免費網域
部署後自動獲得：`https://xxx.pages.dev`

## 檔案結構
- `functions/api/[[path]].js` - 反向代理邏輯
- `static/index.html` - 前端介面
- `wrangler.toml` - Cloudflare 設定

## 部署後設定
1. 在 Cloudflare Dashboard 設定環境變數 `GAS_URL`
2. 或使用預設值（修改程式碼中的 GAS_URL）

## API 路徑
- `/api` - 轉發到 GAS
- `/api?action=get` - 取得資料
- POST `/api` - 新增資料
