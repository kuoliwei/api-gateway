// 這個檔案集中管理 api-gateway 需要用到的設定。
// 好處是其他檔案不用到處寫死 port、service URL 或 JWT secret。
export const config = {
  // Gateway 對外開放的 port，預設使用 8000。
  port: process.env.PORT || 8000,

  // 允許呼叫 Gateway 的前端來源（可多個，用逗號分隔）。
  // 瀏覽器會檢查 response 的 Access-Control-Allow-Origin 是否等於請求的來源。
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  // JWT_SECRET 必須和 auth-service 的 .env 使用同一個值。
  // auth-service 用它簽發 token，api-gateway 用它驗證 token。
  jwtSecret: process.env.JWT_SECRET,

  // auth-service 的位置。Gateway 會把 /auth/* 的請求轉發到這裡。
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',

  // user-service 的位置。Gateway 會把 /users/* 的請求轉發到這裡。
  userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:4000',

  // character-service 的位置。Gateway 會把 /characters/* 的請求轉發到這裡。
  characterServiceUrl: process.env.CHARACTER_SERVICE_URL || 'http://localhost:5000',
};
