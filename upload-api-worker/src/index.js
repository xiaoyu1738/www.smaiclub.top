const ROLE_LEVELS = {
  banned: -1,
  user: 0,
  vip: 1,
  vip2: 2,
  svip: 2,
  svip1: 2,
  svip2: 3,
  admin: 10,
  owner: 100,
};

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const FILE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const NOTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PROJECT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const SHORT_CODE_PATTERN = /^[a-z0-9]{4,5}$/i;
const NOTE_CODE_PATTERN = /^[a-z0-9]{4}$/i;

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("upload-api error", error);
      return json({ error: "SERVER_ERROR", message: "服务器暂时不可用" }, 500, request, env);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupExpired(env));
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request, env) });
  }

  if (!isAllowedRequestOrigin(request, env)) {
    return json({ error: "FORBIDDEN_ORIGIN", message: "请求来源不可用" }, 403, request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    return handleMe(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/v1/space") {
    return withUploader(request, env, async (user) => {
      const space = await getOrCreateSpace(env, user);
      await cleanupExpiredForSpace(env, space.space_id);
      const fileCount = await countActiveFiles(env, space.space_id);
      return json({ space: publicSpace(space), fileCount }, 200, request, env);
    });
  }

  if (request.method === "POST" && url.pathname === "/api/v1/uploads") {
    return withUploader(request, env, (user) => handleUpload(request, env, user));
  }

  if (request.method === "GET" && url.pathname === "/api/v1/files") {
    return withUploader(request, env, async (user) => {
      const space = await getOrCreateSpace(env, user);
      await cleanupExpiredForSpace(env, space.space_id);
      const files = await listFiles(env, space.space_id);
      return json({ space: publicSpace(space), files: files.map((file) => publicFile(file, request, env)) }, 200, request, env);
    });
  }

  const fileMatch = url.pathname.match(/^\/api\/v1\/files\/([^/]+)(?:\/(download|public))?$/);
  if (fileMatch) {
    return withUploader(request, env, (user) => handleFileAction(request, env, user, fileMatch[1], fileMatch[2] || ""));
  }

  if (request.method === "POST" && url.pathname === "/api/v1/notes") {
    return withUploader(request, env, (user) => handleCreateNote(request, env, user));
  }

  const noteMatch = url.pathname.match(/^\/api\/v1\/notes\/([^/]+)\/([^/]+)$/);
  if (noteMatch) {
    return handleNote(request, env, noteMatch[1], noteMatch[2]);
  }

  if (request.method === "POST" && url.pathname === "/api/v1/notes/notice-dismiss") {
    return withUploader(request, env, async (user) => {
      const space = await getOrCreateSpace(env, user);
      await env.UPLOAD_DB.prepare(
        "UPDATE user_spaces SET note_cleanup_notice_dismissed = 1, updated_at = ? WHERE space_id = ?"
      ).bind(Date.now(), space.space_id).run();
      return json({ success: true }, 200, request, env);
    });
  }

  const publicMatch = url.pathname.match(/^\/public\/([^/]+)$/);
  if (request.method === "GET" && publicMatch) {
    return handlePublicDownload(request, env, publicMatch[1]);
  }

  return json({ error: "NOT_FOUND", message: "Not found" }, 404, request, env);
}

async function handleMe(request, env) {
  const user = await getLoginUser(request, env);
  if (!user) {
    return json({ loggedIn: false, canUpload: false }, 200, request, env);
  }

  let space = null;
  let fileCount = 0;
  if (canUpload(user) && env.UPLOAD_DB) {
    space = await getOrCreateSpace(env, user);
    await cleanupExpiredForSpace(env, space.space_id);
    fileCount = await countActiveFiles(env, space.space_id);
  }

  return json({
    loggedIn: true,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    effectiveRole: user.effectiveRole,
    canUpload: canUpload(user),
    space: space ? publicSpace(space) : null,
    fileCount,
  }, 200, request, env);
}

async function withUploader(request, env, handler) {
  if (!env.UPLOAD_DB) {
    return json({ error: "DB_NOT_CONFIGURED", message: "上传暂不可用" }, 503, request, env);
  }

  const user = await getLoginUser(request, env);
  if (!user) {
    return json({ error: "LOGIN_REQUIRED", message: "请先登录" }, 401, request, env);
  }
  if (!canUpload(user)) {
    return json({ error: "FORBIDDEN", message: "当前身份无法上传" }, 403, request, env);
  }
  return handler(user);
}

async function handleUpload(request, env, user) {
  if (!env.UPLOAD_BUCKET) {
    return json({ error: "BUCKET_NOT_CONFIGURED", message: "上传暂不可用" }, 503, request, env);
  }

  const maxBytes = getMaxUploadBytes(env);
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength && contentLength > maxBytes + 4096) {
    return json({ error: "FILE_TOO_LARGE", message: "文件超过单次大小限制" }, 413, request, env);
  }

  const parsed = await parseUploadPayload(request, maxBytes);
  if (parsed.error) {
    return json(parsed.error, parsed.status, request, env);
  }

  const project = normalizeProject(parsed.project);
  if (!project) {
    return json({ error: "INVALID_PROJECT", message: "项目名称不可用" }, 400, request, env);
  }

  const space = await getOrCreateSpace(env, user);
  await cleanupExpiredForSpace(env, space.space_id);
  const objectPath = await chooseAvailablePath(env, space.space_id, buildObjectPath(parsed, project));
  const key = `${space.space_id}/${objectPath}`;
  const now = Date.now();
  const expiresAt = now + FILE_TTL_MS;
  const uploadId = crypto.randomUUID();
  const publicId = randomToken(24);

  await env.UPLOAD_BUCKET.put(key, parsed.body, {
    httpMetadata: {
      contentType: parsed.contentType || "application/octet-stream",
    },
    customMetadata: {
      uploadId,
      spaceId: space.space_id,
      username: user.username,
      filename: parsed.filename,
      objectPath,
      expiresAt: new Date(expiresAt).toISOString(),
    },
  });

  await env.UPLOAD_DB.prepare(
    `INSERT INTO upload_files (
      id, space_id, username, r2_key, object_path, filename, label, project,
      content_type, size, public_id, created_at, expires_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).bind(
    uploadId,
    space.space_id,
    user.username,
    key,
    objectPath,
    parsed.filename,
    parsed.label || "",
    project,
    parsed.contentType || "application/octet-stream",
    parsed.size,
    publicId,
    now,
    expiresAt
  ).run();

  const file = await getFileById(env, uploadId, space.space_id);
  return json({
    success: true,
    space: publicSpace(space),
    upload: publicFile(file, request, env),
  }, 201, request, env);
}

async function handleFileAction(request, env, user, id, action) {
  const space = await getOrCreateSpace(env, user);
  await cleanupExpiredForSpace(env, space.space_id);
  const file = await getFileById(env, id, space.space_id);
  if (!file || file.deleted_at) {
    return json({ error: "NOT_FOUND", message: "文件不存在" }, 404, request, env);
  }
  if (isExpired(file)) {
    await deleteFileObject(env, file);
    return json({ error: "EXPIRED", message: "文件已到期" }, 410, request, env);
  }

  if (request.method === "DELETE" && !action) {
    await deleteFileObject(env, file);
    return json({ success: true }, 200, request, env);
  }

  if (request.method === "GET" && action === "download") {
    return streamFile(env, file, true);
  }

  if (request.method === "GET" && action === "public") {
    return json({ publicUrl: publicFileUrl(file, request, env) }, 200, request, env);
  }

  return json({ error: "NOT_FOUND", message: "Not found" }, 404, request, env);
}

async function handlePublicDownload(request, env, publicId) {
  if (!env.UPLOAD_DB || !env.UPLOAD_BUCKET) {
    return json({ error: "NOT_FOUND", message: "Not found" }, 404, request, env);
  }

  const file = await env.UPLOAD_DB.prepare(
    "SELECT * FROM upload_files WHERE public_id = ? AND deleted_at IS NULL"
  ).bind(publicId).first();
  if (!file) {
    return json({ error: "NOT_FOUND", message: "文件不存在" }, 404, request, env);
  }
  if (isExpired(file)) {
    await deleteFileObject(env, file);
    return json({ error: "EXPIRED", message: "文件已到期" }, 410, request, env);
  }
  return streamFile(env, file, false);
}

async function handleCreateNote(request, env, user) {
  const space = await getOrCreateSpace(env, user);
  const body = await readJson(request);
  const requestedSpace = String(body.space || "").trim();
  if (requestedSpace && !spaceMatches(space, requestedSpace)) {
    return json({ error: "NOT_FOUND", message: "页面不存在" }, 404, request, env);
  }

  const code = await generateUniqueNoteCode(env, space.space_id);
  const now = Date.now();
  await env.UPLOAD_DB.prepare(
    `INSERT INTO online_notes (
      id, space_id, code, content, password_hash, password_salt,
      created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, '', NULL, NULL, ?, ?, ?)`
  ).bind(crypto.randomUUID(), space.space_id, code, now, now, now + NOTE_TTL_MS).run();

  return json({
    note: {
      space: publicSpace(space),
      code,
      url: `${getFrontendOrigin(env)}/${space.short_code}/${code}`,
    },
  }, 201, request, env);
}

async function handleNote(request, env, spaceIdentifier, code) {
  if (!env.UPLOAD_DB) {
    return json({ error: "NOT_FOUND", message: "页面不存在" }, 404, request, env);
  }
  if (!NOTE_CODE_PATTERN.test(code)) {
    return json({ error: "NOT_FOUND", message: "页面不存在" }, 404, request, env);
  }

  const space = await findSpace(env, spaceIdentifier);
  if (!space) {
    return json({ error: "NOT_FOUND", message: "页面不存在" }, 404, request, env);
  }
  const note = await env.UPLOAD_DB.prepare(
    "SELECT * FROM online_notes WHERE space_id = ? AND code = ?"
  ).bind(space.space_id, code.toLowerCase()).first();
  if (!note || Date.now() > note.expires_at) {
    if (note) await env.UPLOAD_DB.prepare("DELETE FROM online_notes WHERE id = ?").bind(note.id).run();
    return json({ error: "NOT_FOUND", message: "页面不存在" }, 404, request, env);
  }

  if (request.method === "GET") {
    return json({
      note: publicNote(note, space, false, env),
      locked: !!note.password_hash,
    }, 200, request, env);
  }

  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, 405, request, env);
  }

  const body = await readJson(request);
  const action = String(body.action || "save");

  if (action === "unlock") {
    const ok = await verifyNotePassword(note, String(body.password || ""));
    if (!ok) {
      return json({ error: "PASSWORD_INVALID", message: "密码不正确" }, 403, request, env);
    }
    return json({ note: publicNote(note, space, true, env) }, 200, request, env);
  }

  if (action === "save") {
    if (note.password_hash) {
      const ok = await verifyNotePassword(note, String(body.password || ""));
      if (!ok) {
        return json({ error: "PASSWORD_INVALID", message: "密码不正确" }, 403, request, env);
      }
    }

    const content = String(body.content || "").slice(0, 200000);
    let passwordHash = note.password_hash;
    let passwordSalt = note.password_salt;
    const password = String(body.password || "");
    if (!note.password_hash && password) {
      passwordSalt = randomToken(16);
      passwordHash = await hashSecret(password, passwordSalt);
    }

    const now = Date.now();
    await env.UPLOAD_DB.prepare(
      "UPDATE online_notes SET content = ?, password_hash = ?, password_salt = ?, updated_at = ?, expires_at = ? WHERE id = ?"
    ).bind(content, passwordHash, passwordSalt, now, now + NOTE_TTL_MS, note.id).run();

    const updated = await env.UPLOAD_DB.prepare("SELECT * FROM online_notes WHERE id = ?").bind(note.id).first();
    return json({ note: publicNote(updated, space, true, env) }, 200, request, env);
  }

  return json({ error: "BAD_REQUEST", message: "请求不可用" }, 400, request, env);
}

async function parseUploadPayload(request, maxBytes) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return {
        status: 400,
        error: { error: "FILE_REQUIRED", message: "请选择文件" },
      };
    }
    if (file.size > maxBytes) {
      return {
        status: 413,
        error: { error: "FILE_TOO_LARGE", message: "文件超过单次大小限制" },
      };
    }

    const buffer = await file.arrayBuffer();
    return {
      body: buffer,
      filename: sanitizeFilename(file.name || "upload.bin"),
      contentType: file.type || "application/octet-stream",
      size: file.size,
      project: String(form.get("project") || "general"),
      label: sanitizeLabel(String(form.get("label") || "")),
      pathMode: String(form.get("pathMode") || "filename"),
      customPath: String(form.get("objectPath") || ""),
    };
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (!contentLength) {
    return {
      status: 400,
      error: { error: "FILE_REQUIRED", message: "请选择文件" },
    };
  }
  if (contentLength > maxBytes) {
    return {
      status: 413,
      error: { error: "FILE_TOO_LARGE", message: "文件超过单次大小限制" },
    };
  }

  const buffer = await request.arrayBuffer();
  return {
    body: buffer,
    filename: sanitizeFilename(request.headers.get("X-SMAI-Filename") || "upload.bin"),
    contentType: contentType || "application/octet-stream",
    size: buffer.byteLength,
    project: request.headers.get("X-SMAI-Project") || "general",
    label: sanitizeLabel(request.headers.get("X-SMAI-Label") || ""),
    pathMode: request.headers.get("X-SMAI-Path-Mode") || "filename",
    customPath: request.headers.get("X-SMAI-Object-Path") || "",
  };
}

function buildObjectPath(parsed, project) {
  const custom = parsed.pathMode === "custom" ? sanitizeObjectPath(parsed.customPath) : "";
  if (custom) return custom;
  return `${project}/${sanitizeFilename(parsed.filename)}`;
}

async function chooseAvailablePath(env, spaceId, requestedPath) {
  const cleanPath = sanitizeObjectPath(requestedPath) || "general/upload.bin";
  const exists = async (path) => {
    const row = await env.UPLOAD_DB.prepare(
      "SELECT id FROM upload_files WHERE space_id = ? AND object_path = ? AND deleted_at IS NULL LIMIT 1"
    ).bind(spaceId, path).first();
    return !!row;
  };

  if (!(await exists(cleanPath))) return cleanPath;

  const slash = cleanPath.lastIndexOf("/");
  const dir = slash >= 0 ? cleanPath.slice(0, slash + 1) : "";
  const base = slash >= 0 ? cleanPath.slice(slash + 1) : cleanPath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";

  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${dir}${stem}-${i}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }

  return `${dir}${stem}-${randomToken(6)}${ext}`;
}

async function getOrCreateSpace(env, user) {
  const existing = await env.UPLOAD_DB.prepare(
    "SELECT * FROM user_spaces WHERE username = ?"
  ).bind(user.username).first();
  if (existing) return existing;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const spaceId = crypto.randomUUID();
    const shortCode = randomToken(5);
    const now = Date.now();
    try {
      await env.UPLOAD_DB.prepare(
        `INSERT INTO user_spaces (
          username, display_name, role, space_id, short_code,
          created_at, updated_at, note_cleanup_notice_dismissed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
      ).bind(user.username, user.displayName || user.username, user.effectiveRole || user.role, spaceId, shortCode, now, now).run();
      return await env.UPLOAD_DB.prepare("SELECT * FROM user_spaces WHERE username = ?").bind(user.username).first();
    } catch (error) {
      if (attempt === 9) throw error;
    }
  }

  throw new Error("Failed to create user space");
}

async function findSpace(env, identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  if (!value) return null;
  if (SHORT_CODE_PATTERN.test(value)) {
    return env.UPLOAD_DB.prepare("SELECT * FROM user_spaces WHERE short_code = ?").bind(value).first();
  }
  return env.UPLOAD_DB.prepare("SELECT * FROM user_spaces WHERE space_id = ?").bind(value).first();
}

function spaceMatches(space, identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  return value === String(space.space_id).toLowerCase() || value === String(space.short_code).toLowerCase();
}

async function countActiveFiles(env, spaceId) {
  const row = await env.UPLOAD_DB.prepare(
    "SELECT COUNT(*) AS count FROM upload_files WHERE space_id = ? AND deleted_at IS NULL AND expires_at > ?"
  ).bind(spaceId, Date.now()).first();
  return row?.count || 0;
}

async function listFiles(env, spaceId) {
  const { results } = await env.UPLOAD_DB.prepare(
    `SELECT * FROM upload_files
     WHERE space_id = ? AND deleted_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC`
  ).bind(spaceId, Date.now()).all();
  return results || [];
}

async function getFileById(env, id, spaceId) {
  return env.UPLOAD_DB.prepare(
    "SELECT * FROM upload_files WHERE id = ? AND space_id = ? LIMIT 1"
  ).bind(id, spaceId).first();
}

async function deleteFileObject(env, file) {
  if (env.UPLOAD_BUCKET) {
    await env.UPLOAD_BUCKET.delete(file.r2_key).catch((error) => {
      console.warn("Failed to delete R2 object", file.r2_key, error);
    });
  }
  if (env.UPLOAD_DB) {
    await env.UPLOAD_DB.prepare(
      "UPDATE upload_files SET deleted_at = ? WHERE id = ?"
    ).bind(Date.now(), file.id).run();
  }
}

async function streamFile(env, file, attachment) {
  const object = await env.UPLOAD_BUCKET.get(file.r2_key);
  if (!object) {
    await deleteFileObject(env, file);
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", file.content_type || headers.get("Content-Type") || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=60");
  if (attachment) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename || "download")}`);
  }
  return new Response(object.body, { headers });
}

async function cleanupExpiredForSpace(env, spaceId) {
  if (!env.UPLOAD_DB) return;
  const { results } = await env.UPLOAD_DB.prepare(
    "SELECT * FROM upload_files WHERE space_id = ? AND deleted_at IS NULL AND expires_at <= ? LIMIT 50"
  ).bind(spaceId, Date.now()).all();
  for (const file of results || []) {
    await deleteFileObject(env, file);
  }
  await env.UPLOAD_DB.prepare("DELETE FROM online_notes WHERE space_id = ? AND expires_at <= ?").bind(spaceId, Date.now()).run();
}

async function cleanupExpired(env) {
  if (!env.UPLOAD_DB) return;
  const { results } = await env.UPLOAD_DB.prepare(
    "SELECT * FROM upload_files WHERE deleted_at IS NULL AND expires_at <= ? LIMIT 200"
  ).bind(Date.now()).all();
  for (const file of results || []) {
    await deleteFileObject(env, file);
  }
  await env.UPLOAD_DB.prepare("DELETE FROM online_notes WHERE expires_at <= ?").bind(Date.now()).run();
}

async function generateUniqueNoteCode(env, spaceId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = randomToken(4);
    const existing = await env.UPLOAD_DB.prepare(
      "SELECT id FROM online_notes WHERE space_id = ? AND code = ? LIMIT 1"
    ).bind(spaceId, code).first();
    if (!existing) return code;
  }
  throw new Error("Failed to generate note code");
}

async function verifyNotePassword(note, password) {
  if (!note.password_hash) return true;
  if (!password) return false;
  return note.password_hash === await hashSecret(password, note.password_salt);
}

async function hashSecret(value, salt) {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJson(request) {
  return request.json().catch(() => ({}));
}

async function getLoginUser(request, env) {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;

  const loginMeUrl = env.LOGIN_ME_URL || "https://login.smaiclub.top/api/me";
  try {
    const response = await fetch(loginMeUrl, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload.loggedIn || !payload.username) return null;
    return {
      username: String(payload.username),
      displayName: String(payload.displayName || payload.username),
      role: normalizeRole(payload.role),
      effectiveRole: normalizeRole(payload.effectiveRole || payload.role),
    };
  } catch (error) {
    console.warn("Failed to verify login session", error);
    return null;
  }
}

function canUpload(user) {
  const role = normalizeRole(user.effectiveRole || user.role);
  return (ROLE_LEVELS[role] ?? 0) > 0;
}

function normalizeRole(role) {
  if (typeof role !== "string") return "user";
  return role.trim().toLowerCase() || "user";
}

function getMaxUploadBytes(env) {
  const value = Number(env.MAX_UPLOAD_BYTES || "");
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.min(value, 100 * 1024 * 1024);
}

function normalizeProject(value) {
  const normalized = String(value || "general").trim().toLowerCase().replace(/\s+/g, "-");
  if (!PROJECT_PATTERN.test(normalized)) return "";
  if (normalized.includes("..")) return "";
  return normalized;
}

function sanitizeFilename(value) {
  const raw = String(value || "upload.bin").normalize("NFKC").split(/[\\/]/).pop() || "upload.bin";
  const cleaned = raw.replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/\s+/g, "-").slice(0, 120);
  return cleaned.replace(/^\.+/, "") || "upload.bin";
}

function sanitizeObjectPath(value) {
  const parts = String(value || "")
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => sanitizeFilename(part))
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.slice(0, 8).join("/").slice(0, 360);
}

function sanitizeLabel(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 80);
}

function randomToken(length) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function isExpired(file) {
  return Date.now() > Number(file.expires_at || 0);
}

function publicSpace(space) {
  return {
    id: space.space_id,
    shortCode: space.short_code,
    dashboardPath: `/${space.short_code}/dashboard`,
    noteCleanupNoticeDismissed: !!space.note_cleanup_notice_dismissed,
  };
}

function publicFile(file, request, env) {
  const now = Date.now();
  const expiresAt = Number(file.expires_at || now);
  return {
    id: file.id,
    path: file.object_path,
    filename: file.filename,
    label: file.label || "",
    project: file.project || "general",
    contentType: file.content_type || "application/octet-stream",
    size: Number(file.size || 0),
    createdAt: new Date(Number(file.created_at || now)).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    daysLeft: Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))),
    publicUrl: publicFileUrl(file, request, env),
    downloadUrl: `${getApiOrigin(request, env)}/api/v1/files/${file.id}/download`,
  };
}

function publicNote(note, space, includeContent, env) {
  return {
    space: publicSpace(space),
    code: note.code,
    url: `${getFrontendOrigin(env)}/${space.short_code}/${note.code}`,
    hasPassword: !!note.password_hash,
    content: includeContent || !note.password_hash ? note.content || "" : "",
    updatedAt: new Date(Number(note.updated_at || Date.now())).toISOString(),
    expiresAt: new Date(Number(note.expires_at || Date.now())).toISOString(),
  };
}

function publicFileUrl(file, request, env) {
  return `${getApiOrigin(request, env)}/public/${file.public_id}`;
}

function getApiOrigin(request, env) {
  return env.PUBLIC_API_ORIGIN || new URL(request.url).origin;
}

function isAllowedRequestOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return originUrl.origin === getFrontendOrigin(env);
  } catch {
    return false;
  }
}

function getFrontendOrigin(env) {
  return env.FRONTEND_ORIGIN || "https://upload.smaiclub.top";
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-SMAI-Project, X-SMAI-Filename, X-SMAI-Label, X-SMAI-Path-Mode, X-SMAI-Object-Path");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  if (origin && isAllowedRequestOrigin(request, env)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    headers.set("Access-Control-Allow-Origin", getFrontendOrigin(env));
  }
  return headers;
}

function json(payload, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}
