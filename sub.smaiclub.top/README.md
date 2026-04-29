# sub.smaiclub.top

SmaiClub 订阅分发 Pages 应用。VPS / 3x-ui 是唯一计费和强控来源，EdgeTunnel 仅作为额外免费节点合并进订阅。

## Cloudflare 配置

D1 binding:

- `DB` -> 现有 `user_db`

Secrets / Variables:

- `LOGIN_ME_URL`: 可选，默认 `https://login.smaiclub.top/api/me`
- `SUB_PUBLIC_ORIGIN`: `https://sub.smaiclub.top`
- `SUB_TRAFFIC_TOTAL_BYTES`: 默认 `536870912000`
- `EDGETUNNEL_SUB_URL`: EdgeTunnel 面板提供的订阅 URL
- `EDGETUNNEL_MAX_NODES`: 默认 `99`
- `EDGETUNNEL_MAX_PER_REGION`: 默认 `3`，同一 IP 地区最多输出 3 个优选节点
- `EDGETUNNEL_GEO_API_URL`: 优选 IP 批量 Geo 查询接口，默认 `http://ip-api.com/batch?fields=status,message,country,countryCode,city,query`
- `XUI_BASE_URL`: 3x-ui 面板 origin，不含末尾斜杠
- `XUI_USERNAME` / `XUI_PASSWORD` 或 `XUI_COOKIE`
- `XUI_INBOUND_ID`: 需要更新 client 的 inbound id
- `REALITY_HOST`
- `REALITY_PORT`
- `REALITY_PUBLIC_KEY`
- `REALITY_SNI`
- `REALITY_SHORT_ID`
- `REALITY_SHORT_IDS`: 可选，逗号分隔；设置后优先于 `REALITY_SHORT_ID`，订阅使用第一项
- `REALITY_SPIDER_X`
- `REALITY_FLOW`
- `REALITY_FINGERPRINT`
- `REALITY_NODE_NAME`

用户和管理员页面使用 SmaiClub 统一登录。`sub_token` 只作为代理客户端无法携带 Cookie 时使用的订阅密钥，由服务端自动生成并与 SmaiClub 用户名绑定。

不要把 3x-ui 密码、Cookie、Reality 参数或 EdgeTunnel token 写入源码。

## Scripts

- `npm test`
- `npm run lint`
- `npm run build`

GitHub Actions uses Node.js 22 for this app because the test runner uses native TypeScript stripping. The deploy step runs Wrangler from the app directory so Pages Functions are uploaded with the static assets.
