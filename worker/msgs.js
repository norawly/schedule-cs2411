/* Чистота чата: бот держит не больше двух своих сообщений.
   Новое приходит — предыдущая карточка пары переписывается на актуальную («идёт сейчас», «прошла»),
   а всё, что старше, удаляется. */
import * as T from "./sched.js";
import * as X from "./text.js";
import { tg } from "./tg.js";

const KEEP = 2;
const OPTS = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };

const rows = (e, chatId) =>
  e.DB.prepare("SELECT * FROM msgs WHERE chat_id = ? ORDER BY at DESC").bind(chatId).all().then(r => r.results);
const forget = (e, chatId, id) =>
  e.DB.prepare("DELETE FROM msgs WHERE chat_id = ? AND message_id = ?").bind(chatId, id).run();
const remember = (e, chatId, id, kind, ref) =>
  e.DB.prepare("INSERT OR REPLACE INTO msgs (chat_id, message_id, kind, at, ref) VALUES (?, ?, ?, ?, ?)")
    .bind(chatId, id, kind, Date.now(), ref ? JSON.stringify(ref) : null).run();

/* последнее сообщение бота в чате — чтобы не слать дубль той же карточки */
export async function newest(e, chatId) {
  const r = await e.DB.prepare("SELECT * FROM msgs WHERE chat_id = ? ORDER BY at DESC LIMIT 1").bind(chatId).first();
  if (!r) return null;
  try { r.data = JSON.parse(r.ref || "null"); } catch { r.data = null; }
  return r;
}

/* переписать уже отправленную карточку (та же пара — новое состояние) */
export async function replace(e, chatId, mid, { photo, text, markup, kind = "class", ref }) {
  const r = photo
    ? await tg(e, "editMessageCaption", { chat_id: chatId, message_id: mid, caption: text, parse_mode: "HTML", reply_markup: markup || { inline_keyboard: [] } })
    : await tg(e, "editMessageText", { chat_id: chatId, message_id: mid, text, ...OPTS, reply_markup: markup || { inline_keyboard: [] } });
  if (!r.ok && !/not modified/i.test(r.description || "")) return null;
  await remember(e, chatId, mid, kind, ref);
  return r;
}

export async function drop(e, chatId, id) {
  await tg(e, "deleteMessage", { chat_id: chatId, message_id: id });
  await forget(e, chatId, id);
}

/* карточку пары переписываем под текущее время: ещё будет → идёт → прошла */
async function refresh(e, chatId, row, load) {
  let ref; try { ref = JSON.parse(row.ref || "null"); } catch { ref = null; }
  if (row.kind !== "class" || !ref) return;
  const S = await load(ref.slug);
  if (!S) return;
  const g = T.dayBlocks(S, ref.iso).find(x => x.rs === ref.rs);
  if (!g) return;
  const now = T.localNow(e);
  const state = X.stateOf(g, ref.iso, now);
  if (state.kind === ref.state) return;                        // ничего не поменялось
  const text = X.classCard(g, ref.info, state, ref.lang);
  const markup = { inline_keyboard: [] };                      // у прошлой карточки кнопки ни к чему
  const r = ref.photo
    ? await tg(e, "editMessageCaption", { chat_id: chatId, message_id: row.message_id, caption: text, parse_mode: "HTML", reply_markup: markup })
    : await tg(e, "editMessageText", { chat_id: chatId, message_id: row.message_id, text, ...OPTS, reply_markup: markup });
  if (r.ok) await remember(e, chatId, row.message_id, row.kind, { ...ref, state: state.kind });
}

/* обновить прошлые карточки и убрать лишние сообщения */
export async function tidy(e, chatId, load, keep = KEEP) {
  const list = await rows(e, chatId);
  for (const row of list.slice(0, keep)) await refresh(e, chatId, row, load).catch(() => {});
  for (const row of list.slice(keep)) await drop(e, chatId, row.message_id).catch(() => {});
}

/* отправить сообщение боту в чат и сразу прибрать за собой */
export async function post(e, chatId, { kind = "info", photo, text, markup, ref }, load) {
  await tidy(e, chatId, load, KEEP - 1);            // место под новое сообщение
  const r = photo
    ? await tg(e, "sendPhoto", { chat_id: chatId, photo, caption: text, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) })
    : await tg(e, "sendMessage", { chat_id: chatId, text, ...OPTS, ...(markup ? { reply_markup: markup } : {}) });
  if (r.ok && r.result) await remember(e, chatId, r.result.message_id, kind, ref);
  return r;
}

/* правка своего же сообщения (кнопки настроек) — счётчик сообщений не растёт */
export async function edit(e, chatId, mid, { text, markup, kind = "info", ref }) {
  const r = await tg(e, "editMessageText",
    { chat_id: chatId, message_id: mid, text, ...OPTS, reply_markup: markup || { inline_keyboard: [] } });
  if (r.ok) { await remember(e, chatId, mid, kind, ref); return r; }
  return /not modified/i.test(r.description || "") ? r : null;
}
