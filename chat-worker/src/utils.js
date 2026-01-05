// Security & Auth Utilities

// --- Encryption (AES-GCM) ---

export async function generateRoomKey() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importRoomKey(keyBase64) {
  try {
    const raw = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (e) {
    throw new Error("Invalid Room Key");
  }
}

export async function encryptMessage(key, content, sender) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();

  const encryptedContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(content)
  );

  const encryptedSender = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(sender)
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    content: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
    sender: btoa(String.fromCharCode(...new Uint8Array(encryptedSender)))
  };
}

// --- Membership & Limits ---

const TIERS = {
  NORMAL: { msgLimit: 700, msgStorage: 5000, roomLimit: 10, retention: 6 }, // retention in months
  VIP: { msgLimit: 4000, msgStorage: 5000, roomLimit: 50, retention: 12 },
  SVIP: { msgLimit: 8000, msgStorage: 8000, roomLimit: 100, retention: 48 },
  SVIP_II: { msgLimit: 10000, msgStorage: 8000, roomLimit: 1000, retention: 288 }
};

export function getTierLimits(role) {
  switch (role) {
    case 'vip': return TIERS.VIP;
    case 'svip': // Fallback for old svip
    case 'svip1': return TIERS.SVIP;
    case 'svip2': return TIERS.SVIP_II;
    default: return TIERS.NORMAL;
  }
}

// Helper to determine effective role based on expiration
export function getEffectiveRole(user) {
  if (!user || !user.role || user.role === 'user') return 'user';

  // Check expiration (1 year = 31536000000 ms)
  const ONE_YEAR = 31536000000;
  const lastPurchase = user.lastPurchase || 0;

  if (Date.now() - lastPurchase > ONE_YEAR) {
    return 'user'; // Expired
  }

  return user.role;
}

// --- Auth Helper ---

export async function getUserFromRequest(request, env) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = {};
  cookieHeader.split(';').forEach(c => {
    const [k, v] = c.split('=');
    if (k && v) cookies[k.trim()] = decodeURI(v.trim());
  });

  const token = cookies['auth_token'];
  if (!token) return null;

  try {
    const sessionStr = await decryptData(token, env.SECRET_KEY, "SESSION_SALT");
    const session = JSON.parse(sessionStr);

    // Fetch full user from DB to check lastPurchase/Role
    const user = await env.USER_DB.prepare('SELECT * FROM users WHERE username = ?').bind(session.username).first();
    return user;
  } catch (e) {
    return null;
  }
}

async function decryptData(encryptedText, secretKey, salt) {
    const parts = encryptedText.split(":");
    if (parts.length !== 2) throw new Error("Invalid format");

    const iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secretKey), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
}

// 统一的错误处理中间件
export async function handleErrors(request, func) {
  try {
    return await func();
  } catch (err) {
    console.error("Worker Error:", err);
    
    // 如果是 Response 对象直接抛出（比如某些库的设计），直接返回
    if (err instanceof Response) {
      return err;
    }

    return new Response(JSON.stringify({
      error: err.message || "Internal Server Error",
      stack: err.stack // 开发环境可以显示，生产环境建议移除
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}