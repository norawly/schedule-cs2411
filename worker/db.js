/* D1: пользователи, отправленные напоминания, служебные ключи */

export const getUser = (env, id) =>
  env.DB.prepare("SELECT * FROM users WHERE chat_id = ?").bind(id).first();

export const createUser = (env, u) =>
  env.DB.prepare(
    "INSERT OR IGNORE INTO users (chat_id, name, username, person, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(u.chat_id, u.name || null, u.username || null, u.person, u.status, Date.now()).run();

const EDITABLE = new Set(["person", "status", "lead_min", "morning", "evening", "notified_at", "name", "username"]);
export async function updateUser(env, id, fields) {
  const keys = Object.keys(fields).filter(k => EDITABLE.has(k));
  if (!keys.length) return;
  await env.DB.prepare(`UPDATE users SET ${keys.map(k => k + " = ?").join(", ")} WHERE chat_id = ?`)
    .bind(...keys.map(k => fields[k]), id).run();
}

export const deleteUser = (env, id) => env.DB.prepare("DELETE FROM users WHERE chat_id = ?").bind(id).run();

export async function countUsers(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status != 'banned'").first();
  return r ? r.n : 0;
}
export async function adminExists(env) {
  return !!(await env.DB.prepare("SELECT 1 FROM users WHERE status = 'admin' LIMIT 1").first());
}
export async function admins(env) {
  return (await env.DB.prepare("SELECT chat_id FROM users WHERE status = 'admin'").all()).results;
}
export async function activeUsers(env) {
  return (await env.DB.prepare("SELECT * FROM users WHERE status IN ('admin', 'approved')").all()).results;
}
export async function allUsers(env) {
  return (await env.DB.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 50").all()).results;
}

/* true — если отметка новая (значит, сообщение ещё не отправляли) */
export async function markSent(env, id, key) {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO sent (chat_id, key, at) VALUES (?, ?, ?)")
    .bind(id, key, Date.now()).run();
  return (r.meta && r.meta.changes) > 0;
}
export const cleanupSent = (env, before) => env.DB.prepare("DELETE FROM sent WHERE at < ?").bind(before).run();

export async function getMeta(env, key) {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first();
  return r ? r.value : null;
}
export const setMeta = (env, key, value) =>
  env.DB.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value)).run();
