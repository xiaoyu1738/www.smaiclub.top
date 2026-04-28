# sub-cron-worker

每小时同步 3x-ui client 用量，并对过期或超出 500GB VPS 计费用量的用户禁用 3x-ui client。

## Cloudflare 配置

D1 binding:

- `DB` -> 现有 `user_db`

Secrets / Variables:

- `XUI_BASE_URL`
- `XUI_USERNAME` / `XUI_PASSWORD` 或 `XUI_COOKIE`
- `XUI_INBOUND_ID`

## Scripts

- `npm test`
- `npm run build`
