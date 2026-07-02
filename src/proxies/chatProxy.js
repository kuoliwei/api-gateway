import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/services.js';

function removeDownstreamCorsHeaders(proxyRes) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// chatProxy 負責把 /conversations 相關請求轉發到 chat-service。
export const chatProxy = createProxyMiddleware({
  target: config.chatServiceUrl,
  changeOrigin: true,
  pathRewrite: (path) => `/api/v1/conversations${path}`,
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log(`📤 [chatProxy] 即將轉發請求 ${req.method} ${req.originalUrl} → ${config.chatServiceUrl}${req.url}`);
    },
    proxyRes: (proxyRes, req, res) => {
      console.log(`📥 [chatProxy] 收到回應，HTTP 狀態碼：${proxyRes.statusCode}`);
      removeDownstreamCorsHeaders(proxyRes);
    },
    error: (err, req, res) => {
      console.error(`❌ [chatProxy] 轉發失敗：${err.message}`);
      res.status(502).json({
        error: 'Bad Gateway',
        message: `無法連線到 chat-service: ${err.message}`
      });
    }
  },
});
