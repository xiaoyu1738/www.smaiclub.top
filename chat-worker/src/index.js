import html from './htmlTemplate.js';
import { handleErrors } from './utils.js';

export { ChatRoom } from './ChatRoom.js';

export default {
  async fetch(request, env) {
    return await handleErrors(request, async () => {
      const url = new URL(request.url);
      const path = url.pathname;

      // 处理 CORS (如果前端和 Worker 不在同一个域)
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      // 1. 首页：返回 HTML
      if (path === "/" || path === "/index.html") {
        return new Response(html, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      // 2. API: 创建新房间
      if (path === "/api/room" && request.method === "POST") {
        // 这里可以添加鉴权逻辑，例如检查 Cookie 或 Header
        // const authHeader = request.headers.get("Authorization");
        // if (!authHeader) {
        //   return jsonResponse({ error: "Unauthorized" }, 401);
        // }

        const id = env.chat_room.newUniqueId();
        return jsonResponse({ id: id.toString() });
      }

      // 3. API: WebSocket 连接
      // 路径格式: /api/room/:roomId/websocket
      const wsMatch = path.match(/^\/api\/room\/([a-zA-Z0-9-]+)\/websocket$/);
      if (wsMatch) {
        const roomId = wsMatch[1];
        // 获取 Durable Object ID
        let id;
        try {
          id = env.chat_room.idFromString(roomId);
        } catch (e) {
          return jsonResponse({ error: "Invalid Room ID" }, 400);
        }
        
        const roomObject = env.chat_room.get(id);
        const newUrl = new URL(request.url);
        newUrl.pathname = "/websocket"; // 转发给 DO 内部的路径
        
        // 将请求转发给 Durable Object
        return roomObject.fetch(new Request(newUrl, request));
      }

      // 404 处理
      return jsonResponse({ error: "Not Found" }, 404);
    });
  },
};

// 辅助函数：统一返回 JSON 响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // 方便开发调试
    },
  });
}