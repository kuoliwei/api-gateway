import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/services.js';

// 下游 user-service 如果有回自己的 CORS header，Gateway 會把它移除。
// 最終給瀏覽器看的 CORS header 應該只由 Gateway 的 cors() middleware 產生。
function removeDownstreamCorsHeaders(proxyRes) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// userProxy 負責把 /users 相關請求轉發到 user-service。
// 這個 proxy 會在 app.js 中搭配 authMiddleware 使用，
// 也就是使用者必須先帶合法 JWT，請求才會被送到 user-service。
export const userProxy = createProxyMiddleware({
  // user-service 預設跑在 http://localhost:4000。
  target: config.userServiceUrl,

  // 讓轉發後的請求 Host 看起來像是直接打到 user-service。
  changeOrigin: true,

  // 這裡沒有 pathRewrite，因為 Gateway 的 /users
  // 和 user-service 的 /users 路徑剛好一樣。
  on: {
    proxyRes: removeDownstreamCorsHeaders,
    error: (err, req, res) => {
      console.error(`❌ [userProxy] 轉發失敗：${err.message}`);
      res.status(502).json({
        error: 'Bad Gateway',
        message: `無法連線到 user-service: ${err.message}`
      });
    }
  },
});
