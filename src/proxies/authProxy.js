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

  // 前端對 Gateway 打 /auth/register，
  // 但 auth-service 真正的路由是 /api/v1/auth/register。
  // 所以這裡把路徑開頭的 /auth 改寫成 /api/v1/auth。
  pathRewrite: {
    '^/auth': '/api/v1/auth',
  },
  on: {
    proxyRes: removeDownstreamCorsHeaders,
  },
});
