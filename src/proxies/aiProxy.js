import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/services.js';

function removeDownstreamCorsHeaders(proxyRes) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// aiProxy 負責把 /internal/rag 和 /internal/chat 相關請求轉發到 ai-service。
// ai-service 內部路徑為 /api/v1/rag 和 /api/v1/chat，
// 所以這裡透過 pathRewrite 把路徑轉換成 /api/v1/{rag|chat}。
export const aiProxy = createProxyMiddleware({
  target: config.aiServiceUrl,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    console.log(`🔍 [aiProxy] pathRewrite 輸入: ${path}, originalUrl: ${req.originalUrl}`);
    let rewritten = path;

    // Express 已經去掉了 /internal/rag 或 /internal/chat 前綴
    // 現在 path 是剩下的部分，比如 /conversations/initialize 或 /generate
    if (req.originalUrl.includes('/internal/rag')) {
      rewritten = `/api/v1/rag${path}`;
    } else if (req.originalUrl.includes('/internal/chat')) {
      rewritten = `/api/v1/chat${path}`;
    }

    console.log(`📝 [aiProxy] pathRewrite 輸出: ${rewritten}`);
    return rewritten;
  },
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log(`📤 [aiProxy] 即將轉發請求 ${req.method} ${req.originalUrl} → ${config.aiServiceUrl}${req.url}`);
    },
    proxyRes: (proxyRes, req, res) => {
      console.log(`📥 [aiProxy] 收到回應，HTTP 狀態碼：${proxyRes.statusCode}`);
      removeDownstreamCorsHeaders(proxyRes);
    },
    error: (err, req, res) => {
      console.error(`❌ [aiProxy] 轉發失敗：${err.message}`);
    }
  },
});
