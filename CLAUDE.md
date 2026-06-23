# api-gateway

Express 寫的 API Gateway，是 persona-nexus 平台所有前端唯一會直接呼叫的後端入口。負責 CORS、JWT 驗證，並把請求轉發（proxy）到各個微服務。本身不含業務邏輯。

## 角色定位

```
瀏覽器 (persona-nexus-auth / -character / -lobby)
        ↓
   api-gateway (本專案, port 8000)
        ↓ proxy
  ┌─────────────┬──────────────┬───────────────────┐
auth-service   user-service   character-service
(port 3000)    (port 4000)    (port 5000)
```

- 三個前端都跑 Vite dev server，固定 port：5173 (auth/登入)、5174 (character/角色編輯)、5175 (lobby/大廳)。
- 各微服務路徑都帶 `/api/v1/...` 前綴，但 Gateway 對外故意不暴露這個前綴（見下方路由表），由 proxy 的 `pathRewrite` 轉換。

## 路由與轉發規則

| Gateway 路徑 | 後端 | 是否需 JWT | 備註 |
|---|---|---|---|
| `GET /health` | 本機 | 否 | 健康檢查 |
| `POST /auth/register` | auth-service `/api/v1/auth/register` | 否 | `authProxy.js`，`pathRewrite: ^/auth → /api/v1/auth` |
| `POST /auth/login` | auth-service `/api/v1/auth/login` | 否 | 同上 |
| `/users/*` | user-service `/users/*` | 是 | `userProxy.js`，路徑不變（無 rewrite） |
| `/characters/*` | character-service `/api/v1/characters/*` | 是 | `characterProxy.js`，`pathRewrite: ^/characters → /api/v1/characters` |

新增微服務時的固定模式（仿照 `src/proxies/userProxy.js` 或 `characterProxy.js`）：
1. 在 `src/config/services.js` 加 `xxxServiceUrl`（讀 `process.env.XXX_SERVICE_URL`，給預設值）
2. 在 `src/proxies/` 新增 `xxxProxy.js`，用 `createProxyMiddleware`，記得在 `proxyRes` 裡移除下游的 CORS header，最終 CORS 一律由 Gateway 統一決定
3. 在 `src/app.js` 掛 `app.use('/xxx', authMiddleware, xxxProxy)`（公開路由才不用 `authMiddleware`）
4. `.env` 和 `.env.example` 都要補上對應的 `XXX_SERVICE_URL`

## 認證機制

- `src/middlewares/authMiddleware.js`：檢查 `Authorization: Bearer <token>`，用 `config.jwtSecret` 驗證 JWT。驗證成功後把 payload 寫入 `req.user`，並塞入 `x-user-id` / `x-user-email` header 轉發給後端服務。
- `JWT_SECRET` 必須和 auth-service 的 `.env` 完全一致，否則 Gateway 驗不過自己發出去的 token。
- 401：缺 header / token 無效或過期。500：Gateway 自己沒設定 `JWT_SECRET`（環境配置錯誤）。

## CORS（多前端來源，已解決）

`config.frontendOrigins`（注意是複數）從 `.env` 的 `FRONTEND_ORIGIN` 解析，**逗號分隔**多個來源，目前已正確設定三個前端：

```
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175
```

`src/config/services.js` 用 `.split(',').map(trim).filter(Boolean)` 轉成陣列，直接傳給 `cors({ origin: config.frontendOrigins, credentials: true })`。新增第四個前端時只要在 `.env` 這一行加逗號即可，不用改程式碼。

## 環境變數

- `.env`（不進版控，已設定好）：`PORT`、`FRONTEND_ORIGIN`（三個 origin）、`JWT_SECRET`、`AUTH_SERVICE_URL`、`USER_SERVICE_URL`、`CHARACTER_SERVICE_URL`
- `.env.example`：**目前落後於 `.env`**，只列了單一 `FRONTEND_ORIGIN` 且缺少 `CHARACTER_SERVICE_URL`，新環境照 example 設定會漏掉 character-service。修改 `.env` 時記得同步更新 example。

## 啟動方式

```
npm run dev   # = node src/app.js，無 nodemon，改完程式碼要手動重啟
```

啟動後 log 會印出每個下游 service 的 target URL，方便確認 `.env` 有沒有吃到。

## 已知狀況 / 待辦

- 目前沒有 git（`.git` 不存在），所有變更只存在檔案系統上，沒有版本控制與 commit 歷史。
- 沒有測試（無 test script）、沒有 lint config。
- character-service、user-service、auth-service 通常需要分別在各自資料夾手動啟動，Gateway 不會幫忙拉起它們。
- 平台正在把 `api-gateway`、`auth-service`、`user-service`、`character-service`、`persona-nexus-auth/-character/-lobby` 整合到同一個工作資料夾下，方便用一個 Claude Code session 跨專案操作（目前用複製的方式合併，非 git monorepo）。
- `.env.example` 與實際 `.env` 不同步（見上）。
