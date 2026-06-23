import jwt from 'jsonwebtoken';
import { config } from '../config/services.js';

// authMiddleware 是「受保護路由」會先經過的 JWT 驗證關卡。
// 如果 token 合法，就呼叫 next() 放行，讓請求繼續被 proxy 轉發。
// 如果 token 不合法，Gateway 會直接回 401，不會把請求送到後端服務。
export function authMiddleware(req, res, next) {
  console.log(`\n🔐 [authMiddleware] 攔截到請求：${req.method} ${req.originalUrl}`);

  // Gateway 驗 token 需要 JWT_SECRET。
  // 如果沒有設定，代表伺服器環境配置錯誤，所以回 500。
  if (!config.jwtSecret) {
    console.error('🚨 [authMiddleware] JWT_SECRET 未設定，無法驗證 token！');
    return res.status(500).json({
      message: 'JWT_SECRET is not configured in api-gateway',
    });
  }

  // 前端應該把 token 放在 Authorization header：
  // Authorization: Bearer <JWT_TOKEN>
  const authHeader = req.headers.authorization;

  // 如果沒有 Authorization header，或格式不是 Bearer token，就拒絕請求。
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('❌ [authMiddleware] 缺少或格式錯誤的 Authorization header，拒絕請求（401）');
    return res.status(401).json({
      message: 'Missing or invalid Authorization header',
    });
  }

  // 把 "Bearer " 前綴拿掉，只留下真正的 JWT 字串。
  const token = authHeader.slice('Bearer '.length);

  try {
    // 驗證 token 是否由同一個 JWT_SECRET 簽發，且尚未過期。
    // 驗證成功時，jsonwebtoken 會回傳 token payload。
    const payload = jwt.verify(token, config.jwtSecret);
    console.log('✅ [authMiddleware] token 驗證成功！payload：', payload);

    // 把 payload 暫存在 req.user，讓後續 middleware 或 route 可以使用。
    // 目前 proxy 本身不一定會用到，但這是常見做法。
    req.user = payload;

    // 將目前登入者資訊塞進自訂 header，轉發給後端服務。
    // 這樣後端服務未來可以透過 x-user-id / x-user-email 得知呼叫者身份。
    req.headers['x-user-id'] = payload.id || payload.userId || '';
    req.headers['x-user-email'] = payload.email || '';
    console.log(`📨 [authMiddleware] 已注入 x-user-id=${req.headers['x-user-id']}，轉發給後端服務`);

    // 驗證成功，交給下一個 middleware。
    return next();
  } catch (error) {
    // jwt.verify 失敗通常代表 token 無效、被竄改，或已過期。
    console.warn(`❌ [authMiddleware] token 驗證失敗（${error.message}），拒絕請求（401）`);
    return res.status(401).json({
      message: 'Invalid or expired token',
    });
  }
}
