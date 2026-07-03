import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/services.js';

function removeDownstreamCorsHeaders(proxyRes) {
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['access-control-allow-credentials'];
  delete proxyRes.headers['access-control-allow-methods'];
  delete proxyRes.headers['access-control-allow-headers'];
}

// aiProxy 負責把 /internal/rag、/internal/chat 和 /internal/health 相關請求轉發到 ai-service。
// ai-service 內部路徑為 /api/v1/rag、/api/v1/chat 和 /health，
// 所以這裡透過 pathRewrite 把路徑轉換成對應的格式。
export const aiProxy = createProxyMiddleware({
  target: config.aiServiceUrl,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    console.log(`🔍 [aiProxy] pathRewrite 輸入: ${path}, originalUrl: ${req.originalUrl}`);
    let rewritten = path;

    // Express 已經去掉了 /internal/rag、/internal/chat 或 /internal/health 前綴
    // 現在 path 是剩下的部分
    if (req.originalUrl.includes('/internal/rag')) {
      rewritten = `/api/v1/rag${path}`;
    } else if (req.originalUrl.includes('/internal/chat')) {
      rewritten = `/api/v1/chat${path}`;
    } else if (req.originalUrl.includes('/internal/health')) {
      rewritten = `/health`;
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
      res.status(502).json({
        error: 'Bad Gateway',
        message: '無法連線到 AI 伺服器，請稍後重試。'
      });
    }
  },
});
