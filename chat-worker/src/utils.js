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
