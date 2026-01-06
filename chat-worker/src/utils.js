// Security & Auth Utilities

// --- Encryption (AES-GCM) ---

export async function generateRoomKey() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  const randomValues = new Uint8Array(10);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 10; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

export function validateCustomKey(key) {
  if (!key) return false;
  if (key.length <= 8 || key.length >= 20) return false;
  // Allow numbers and letters (upper and lower), no symbols
  return /^[a-zA-Z0-9]+$/.test(key);
}

export async function importRoomKey(password) {
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("SMAICLUB_CHAT_SALT"),
        iterations: 10000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
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

/**
 * 通过调用 login-worker 的 /api/me 接口验证用户身份
 * 这样不需要在 chat-worker 中配置 SECRET_KEY
 */
export async function getUserFromRequest(request, env) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  try {
    // 调用 login-worker 的 /api/me 接口验证用户
    const response = await fetch('https://login.smaiclub.top/api/me', {
      headers: {
        'Cookie': cookieHeader
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    
    if (!data.loggedIn) return null;

    // 返回用户信息，格式与之前兼容
    return {
      username: data.username,
      role: data.effectiveRole || data.role || 'user',
      lastPurchase: Date.now() // 由于 /api/me 不返回 lastPurchase，我们假设有效
    };
  } catch (e) {
    console.error("getUserFromRequest error:", e.message);
    return null;
  }
}
