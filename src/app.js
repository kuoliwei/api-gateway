// 使用方式：npm run dev
// 讀取 .env 內的環境變數，例如 PORT、JWT_SECRET、AUTH_SERVICE_URL。
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config/services.js';
import { authMiddleware } from './middlewares/authMiddleware.js';
import { publicAuthProxy } from './proxies/authProxy.js';
import { userProxy } from './proxies/userProxy.js';
import { characterProxy } from './proxies/characterProxy.js';

// 建立 Express 應用程式，這個 app 就是 API Gateway 本體。
const app = express();

// 啟用 CORS，讓前端可以從不同 origin 呼叫 Gateway。
// 開發階段先開放預設設定；正式環境通常會限制特定 frontend domain。
// Gateway 是瀏覽器真正呼叫的 API，所以 CORS 應該由 Gateway 統一回給前端。
// 這裡允許多個 Vite 前端（登入頁、角色編輯頁、大廳）。
app.use(cors({
  origin: config.frontendOrigins,
  credentials: true,
}));

// 健康檢查路由，用來確認 Gateway 是否正常啟動。
// 可以打 GET http://localhost:8000/health 測試。
app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
  });
});

// 公開路由：前端配置端點。
// 前端啟動時呼叫此端點，獲取後端服務的地址。
app.get('/api/config', (req, res) => {
  return res.status(200).json({
    services: {
      gateway: process.env.API_GATEWAY_URL || `http://localhost:${config.port}`,
    },
    frontends: {
      web: process.env.FRONTEND_WEB_URL || 'http://localhost:5173',
      character: process.env.FRONTEND_CHARACTER_URL || 'http://localhost:5174',
      lobby: process.env.FRONTEND_LOBBY_URL || 'http://localhost:5175',
    }
  });
});

// 公開路由：註冊不需要 token。
// Gateway 收到 POST /auth/register 後，會轉發到 auth-service。
app.post('/auth/register', publicAuthProxy);

// 公開路由：登入不需要 token。
// Gateway 收到 POST /auth/login 後，會轉發到 auth-service。
app.post('/auth/login', publicAuthProxy);

// 受保護路由：user-service 的操作。
// 流程：先驗 JWT，成功後把 /users 相關請求轉發到 user-service。
app.use('/users', authMiddleware, userProxy);

// 受保護路由：character-service 的操作。
// 流程：先驗 JWT，成功後把 /characters 相關請求轉發到 character-service。
// pathRewrite 會把 /characters 轉換成 character-service 內部的 /api/v1/characters。
app.use('/characters', authMiddleware, characterProxy);

// 如果上面的路由都沒有匹配到，就回傳 404。
// 這可以避免使用者打錯路由時收到不清楚的預設回應。
app.use((req, res) => {
  return res.status(404).json({
    message: 'Route not found',
  });
});

// 啟動 Gateway，監聽 config.port。
// 預設是 8000，也可以透過 .env 的 PORT 修改。
app.listen(config.port, () => {
  console.log(`api-gateway is running on port ${config.port}`);
  console.log(`auth-service target: ${config.authServiceUrl}`);
  console.log(`user-service target: ${config.userServiceUrl}`);
  console.log(`character-service target: ${config.characterServiceUrl}`);
});
