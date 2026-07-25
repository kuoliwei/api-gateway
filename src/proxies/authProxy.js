import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/services.js';

// 下游 auth-service 可能會回自己的 CORS header。
// 但瀏覽器實際上是呼叫 Gateway，所以最終 CORS header 必須由 Gateway 決定。
function removeDownstreamCorsHeaders(proxyRes) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// publicAuthProxy 處理「公開的 auth 路由」。
// 例如註冊、登入本來就還沒有 token，所以不需要先經過 authMiddleware。
export const publicAuthProxy = createProxyMiddleware({
  // target 是實際要轉發過去的服務，也就是 auth-service。
  target: config.authServiceUrl,

  // changeOrigin 會把轉發請求的 Host header 改成 target 的 host。
  // 對多數後端服務或反向代理情境來說，這樣比較符合預期。
  changeOrigin: true,

  // 前端對 Gateway 打 /api/auth/register，
  // 但 auth-service 真正的路由是 /api/v1/auth/register。
  // 這裡是用 app.post('/api/auth/...') 精確路徑掛載（不是 app.use 前綴掛載），
  // Express 不會幫忙 strip 掉 mount 路徑，所以 req.url 進來時仍是完整的
  // /api/auth/register，要把開頭的 /api/auth 改寫成 /api/v1/auth。
  pathRewrite: {
    '^/api/auth': '/api/v1/auth',
  },
  on: {
    proxyRes: removeDownstreamCorsHeaders,
    error: (err, req, res) => {
      console.error(`❌ [authProxy] 轉發失敗：${err.message}`);
      res.status(502).json({
        error: 'Bad Gateway',
        message: '無法連線到認證伺服器，請稍後重試。'
      });
    }
  },
});
