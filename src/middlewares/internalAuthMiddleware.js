/**
 * 內部服務認證中間層
 * 檢查請求是否來自內部服務（同一網路內的服務）
 */

export const internalAuthMiddleware = (req, res, next) => {
  // 獲取請求來源 IP
  const clientIp = req.ip || req.connection.remoteAddress;

  // 允許的內部 IP（本機和內網）
  const allowedIps = ['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1'];

  // 檢查是否來自內部
  const isInternal = allowedIps.includes(clientIp) || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');

  if (!isInternal) {
    console.warn(`⚠️ [internalAuth] 非內部請求被拒: IP=${clientIp}`);
    return res.status(403).json({ message: 'Forbidden: Internal API only' });
  }

  console.log(`✅ [internalAuth] 內部請求通過: IP=${clientIp}`);
  next();
};
