import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/services.js';

function removeDownstreamCorsHeaders(proxyRes) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// characterProxy 負責把 /characters 相關請求轉發到 character-service。
// character-service 內部路徑為 /api/v1/characters，
// 所以這裡透過 pathRewrite 把 /characters 轉換成 /api/v1/characters。
export const characterProxy = createProxyMiddleware({
  target: config.characterServiceUrl,
  changeOrigin: true,
  pathRewrite: (path) => `/api/v1/characters${path}`,
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log(`📤 [characterProxy] 即將轉發請求 ${req.method} ${req.originalUrl} → ${config.characterServiceUrl}${req.url}`);
    },
    proxyRes: (proxyRes, req, res) => {
      console.log(`📥 [characterProxy] 收到回應，HTTP 狀態碼：${proxyRes.statusCode}`);
      removeDownstreamCorsHeaders(proxyRes);
    },
    error: (err, req, res) => {
      console.error(`❌ [characterProxy] 轉發失敗：${err.message}`);
      res.status(502).json({
        error: 'Bad Gateway',
        message: '無法連線到角色伺服器，請稍後重試。'
      });
    }
  },
});
