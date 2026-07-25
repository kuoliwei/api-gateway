# api-gateway

Express 寫的 API Gateway，是 persona-nexus 平台所有前端唯一會直接呼叫的後端入口。負責 CORS、JWT 驗證，並把請求轉發（proxy）到各個微服務。本身不含業務邏輯。

## 角色定位

```
瀏覽器 / Caddy 同源代理 (persona-nexus-auth / -character / -lobby / -chat)
        ↓
   api-gateway (本專案, port 8000) —— 唯一的公開面向入口，所有 /api/* 外部路由與 /internal/* 服務間路由都經過這裡
        ↓ proxy
  ┌─────────────┬──────────────┬───────────────────┬──────────────┬────────────┐
auth-service   user-service   character-service   chat-service   ai-service
(port 3000)    (port 4000)    (port 5000)          (port 6000)    (port 6001)
```

- 四個前端都跑 Vite dev server，固定 port：5173 (auth/登入)、5174 (character/角色編輯)、5175 (lobby/大廳)、5176 (chat)。
- 同源部署下（Caddy，see `../openspec/changes/same-origin-deployment/`），前端經 `http://localhost:8080/api/*` 打 Gateway；`GET /api/config` 回傳的預設服務網址也已改成這個同源入口，不再是各服務裸 port。
- 所有對外路由都掛在 `/api` 前綴下（`/api/auth/*`、`/api/users/*`、`/api/characters/*`、`/api/conversations/*`），這是配合 Caddy 同源部署 `/api/*` 轉發規則所做的调整（Caddy 轉發時不會 strip `/api` 前綴，Gateway 這邊要吃得到）。
- 各微服務內部路徑都帶 `/api/v1/...` 前綴（user-service 例外，見下方路由表），Gateway 對外仍不暴露這個內部前綴，由 proxy 的 `pathRewrite` 轉換。

## 路由與轉發規則

### 外部路由（`/api/*`，除公開路由外都需 JWT）

| Gateway 路徑 | 掛載方式 | 後端 | 是否需 JWT | 備註 |
|---|---|---|---|---|
| `GET /health` | 本機 | 本機回應 | 否 | 健康檢查 |
| `GET /api/config` | 本機 | 本機回應 | 否 | 回傳前端該用的服務網址，預設值是 Caddy 同源入口（`localhost:8080/...`） |
| `POST /api/auth/register` | 精確掛載 (`app.post`) | auth-service `/api/v1/auth/register` | 否 | `authProxy.js`，`pathRewrite: ^/api/auth → /api/v1/auth`（精確掛載時 Express 不會 strip 掉 `/api/auth`，所以要在 pathRewrite 裡連前綴一起換掉） |
| `POST /api/auth/login` | 精確掛載 | auth-service `/api/v1/auth/login` | 否 | 同上 |
| `/api/users/*` | 前綴掛載 (`app.use`) | user-service `/users/*` | 是 | `userProxy.js`，`pathRewrite: (path) => \`/users${path}\`` — 前綴掛載會把 `/api/users` strip 掉，要補回 `/users` 才能對上 user-service 的路由 |
| `/api/characters/*` | 前綴掛載 | character-service `/api/v1/characters/*` | 是 | `characterProxy.js`，`pathRewrite: (path) => \`/api/v1/characters${path}\`` |
| `/api/conversations/*` | 前綴掛載 | chat-service `/api/v1/conversations/*` | 是 | `chatProxy.js`，`pathRewrite: (path) => \`/api/v1/conversations${path}\`` |

### 內部路由（`/internal/*`，服務間通訊用，`internalAuthMiddleware` 驗 IP 而非 JWT）

| Gateway 路徑 | 後端 | 呼叫方 | 備註 |
|---|---|---|---|
| `/internal/characters/*` | character-service `/api/v1/characters/*` | ai-service | 與 `/api/characters` 共用 `characterProxy.js` |
| `/internal/conversations/*` | chat-service `/api/v1/conversations/*` | ai-service | 與 `/api/conversations` 共用 `chatProxy.js` |
| `GET /internal/users/:id`、`POST /internal/users` | user-service `/users/*` | auth-service（註冊時建帳號，取代原本直連 user-service:4000）；`GET /:id` 保留供未來使用 | 與 `/api/users` 共用 `userProxy.js`，同樣靠 `pathRewrite: (path) => \`/users${path}\`` 補回前綴 |
| `/internal/rag/*` | ai-service `/api/v1/rag/*` | chat-service | `aiProxy.js` |
| `/internal/chat/*` | ai-service `/api/v1/chat/*` | chat-service | `aiProxy.js` |
| `/internal/health` | ai-service `/health` | chat-service | `aiProxy.js` |

`internalAuthMiddleware`（`src/middlewares/internalAuthMiddleware.js`）只放行 IP 在白名單內（`127.0.0.1`、`::1`、`192.168.*`、`10.*`）的請求，通過後會在 `req.headers['x-internal-request'] = 'true'` 注入這個 header 再轉發給下游服務，讓下游可以跳過一般使用者的所有權檢查；非白名單 IP 直接回 403，不轉發。

新增微服務時的固定模式（仿照 `src/proxies/userProxy.js` 或 `characterProxy.js`）：
1. 在 `src/config/services.js` 加 `xxxServiceUrl`（讀 `process.env.XXX_SERVICE_URL`，給預設值）
2. 在 `src/proxies/` 新增 `xxxProxy.js`，用 `createProxyMiddleware`，記得在 `proxyRes` 裡移除下游的 CORS header，最終 CORS 一律由 Gateway 統一決定
3. 在 `src/app.js` 掛 `app.use('/api/xxx', authMiddleware, xxxProxy)`（外部路由要帶 `/api` 前綴；公開路由才不用 `authMiddleware`；服務間路由則掛在 `/internal/xxx` 並用 `internalAuthMiddleware`）
4. `.env` 和 `.env.example` 都要補上對應的 `XXX_SERVICE_URL`

## 認證機制

- `src/middlewares/authMiddleware.js`：檢查 `Authorization: Bearer <token>`，用 `config.jwtSecret` 驗證 JWT。驗證成功後把 payload 寫入 `req.user`，並塞入 `x-user-id` / `x-user-email` header 轉發給後端服務。用在所有 `/api/*` 的受保護路由。
- `src/middlewares/internalAuthMiddleware.js`：不驗 JWT，改驗來源 IP（見上方內部路由表），通過後注入 `x-internal-request: true`。用在所有 `/internal/*` 路由。
- `JWT_SECRET` 必須和 auth-service 的 `.env` 完全一致，否則 Gateway 驗不過自己發出去的 token。
- 401：缺 header / token 無效或過期（`/api/*`）。403：IP 不在白名單（`/internal/*`）。500：Gateway 自己沒設定 `JWT_SECRET`（環境配置錯誤）。

## CORS（多前端來源，已解決）

`config.frontendOrigins`（注意是複數）從 `.env` 的 `FRONTEND_ORIGIN` 解析，**逗號分隔**多個來源，目前已正確設定四個前端：

```
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
```

`src/config/services.js` 用 `.split(',').map(trim).filter(Boolean)` 轉成陣列，直接傳給 `cors({ origin: config.frontendOrigins, credentials: true })`。新增第五個前端時只要在 `.env` 這一行加逗號即可，不用改程式碼。

## 環境變數

- `.env`（不進版控，已設定好）：`PORT`、`FRONTEND_ORIGIN`（四個 origin）、`JWT_SECRET`、`AUTH_SERVICE_URL`、`USER_SERVICE_URL`、`CHARACTER_SERVICE_URL`、`CHAT_SERVICE_URL`、`AI_SERVICE_URL`
- `.env.example`：已與 `.env` 同步，涵蓋上述全部變數（含 `CHAT_SERVICE_URL`、`AI_SERVICE_URL`）。修改 `.env` 時記得同步更新 example。

## 啟動方式

```
npm run dev   # = node src/app.js，無 nodemon，改完程式碼要手動重啟
```

啟動後 log 會以方框樣式印出監聽的 port，以及每個下游 service（auth/user/character/chat/ai）的 target URL，方便確認 `.env` 有沒有吃到。

## 已知狀況 / 待辦

- 本專案是獨立的 git repo（remote `origin` → github.com/kuoliwei/api-gateway.git，branch `master`），有版本控制與 commit 歷史。
- 沒有測試（無 test script）、沒有 lint config。
- character-service、user-service、auth-service、chat-service、ai-service 通常需要分別在各自資料夾手動啟動，Gateway 不會幫忙拉起它們。
- 平台把 `api-gateway`、`auth-service`、`user-service`、`character-service`、`chat-service`、`ai-service`、`persona-nexus-auth/-character/-lobby/-chat` 整合到同一個工作資料夾下（`persona-nexus-platform`），方便用一個 Claude Code session 跨專案操作；上一層資料夾是獨立的 root git repo，本專案（`api-gateway/`）則是巢狀的獨立 git repo，各自有各自的版本控制。
- 同源部署（Caddy）相關細節見上一層資料夾的 `../openspec/changes/same-origin-deployment/`；架構準則與修正紀錄見 `../微服務架構準則.md`、`../微服務架構實作spec.md`、`../mistakes.md`、`../執行日誌.md`。
