# chat.smaiclub.top

独立的 SMAI Chat 前端，使用 React、Vite 和 TypeScript 构建，部署到 Cloudflare Pages。

后端 API 和 WebSocket 由 `chat-worker` 提供，默认地址为：

```sh
https://chat-api.smaiclub.top
```

本地调试时可以覆盖：

```sh
VITE_CHAT_API_BASE=http://127.0.0.1:8787 npm run dev
```

只预览 UI 时可以打开演示模式，不会连接真实登录、API 或 WebSocket：

```sh
VITE_CHAT_DEMO=1 npm run dev
```

## Scripts

```sh
npm run dev
npm run lint
npm run build
```
