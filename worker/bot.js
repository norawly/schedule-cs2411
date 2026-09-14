/* Обработка сообщений и кнопок бота */
import * as T from "./sched.js";
import * as X from "./text.js";
import * as db from "./db.js";
import { tg } from "./tg.js";

const LEADS = [20, 30, 10, 15, 5, 0];          // по кругу: 20 → 30 → 10 → 15 → 5 → выкл
const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];

/* ---------- данные из статики ---------- */
const cache = new Map();
async function asset(e, key, path) {
  if (cache.has(key)) return cache.get(key);
  const r = await e.ASSETS.fetch(new Request(e.PUBLIC_URL + path));
  const v = r.ok ? await r.json() : null;
  if (v) cache.set(key, v);
  return v;
}
export const loadPeople = async e => (await asset(e, "people", "/people.json")) || [];
export const loadSchedule = (e, slug) => slug ? asset(e, "s:" + slug, `/${slug}/schedule.json`) : null;
const loadRoomMaps = async e => (await asset(e, "maps", "/map/rooms/index.json")) || { rooms: {} };
const site = (e, slug, query = "") => `${e.PUBLIC_URL}/${slug}/${query}`;

/* ---------- отправка ---------- */
const OPTS = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };
export const send = (e, chatId, text, markup) =>
  tg(e, "sendMessage", { chat_id: chatId, text, ...OPTS, ...(markup ? { reply_markup: markup } : {}) });

async function show(c, text, markup, edit) {
  if (edit && c.mid) {
    const r = await tg(c.env, "editMessageText",
      { chat_id: c.chatId, message_id: c.mid, text, ...OPTS, reply_markup: markup || { inline_keyboard: [] } });
    if (r.ok || /not modified/i.test(r.description || "")) return r;
  }
  return send(c.env, c.chatId, text, markup);
}

const sendPhoto = (e, chatId, file, version, caption, markup) =>
  tg(e, "sendPhoto", { chat_id: chatId, photo: `${e.PUBLIC_URL}/map/rooms/${file}?v=${version}`,
                       caption, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) });

/* ---------- клавиатуры ---------- */
export const menuKeyboard = (e, slug) => ({
  keyboard: [
    [{ text: "⏭ Следующая пара" }, { text: "⚙️ Настройки" }],
    [{ text: "🌐 Расписание", web_app: { url: site(e, slug) } }],
  ],
  resize_keyboard: true,
  is_persistent: true,
});

function classButtons(e, slug, it) {
  if (it.online) return [{ text: "💻 Открыть LMS", url: "https://lms.astanait.edu.kz" }];
  if (T.bldg(it)) return [];
  return [{ text: "🗺 Открыть на карте", web_app: { url: site(e, slug, "?room=" + encodeURIComponent(T.roomShort(it.room))) } }];
}

/* карточка пары: сверху картинка карты с кабинетом, под ней предмет, начало и кабинет */
export async function sendClassCard(e, chatId, slug, head, g, extraRows = [], when = "") {
  const it = g.it;
  const maps = await loadRoomMaps(e);
  const info = (!it.online && !T.bldg(it)) ? (maps.rooms || {})[T.mapKey(it.room)] : null;
  const caption = X.classCard(head, g, info, when);
  const btn = classButtons(e, slug, it);
  const rows = [...(btn.length ? [btn] : []), ...extraRows];
  const markup = rows.length ? { inline_keyboard: rows } : undefined;
  if (info) {
    const r = await sendPhoto(e, chatId, info.file, maps.version, caption, markup);
    if (r.ok) return r;
  }
  return send(e, chatId, caption, markup);
}

/* ---------- вход ---------- */
export async function handleUpdate(e, update) {
  const msg = update.message, cb = update.callback_query;
  const chat = msg ? msg.chat : cb && cb.message && cb.message.chat;
  const from = msg ? msg.from : cb && cb.from;
  if (!chat || chat.type !== "private" || !from || from.is_bot) return;

  /* защита от спама: не больше N действий в минуту с одного аккаунта */
  if (e.RL) {
    const { success } = await e.RL.limit({ key: "chat:" + chat.id });
    if (!success) return;
  }

  const user = await db.getUser(e, chat.id);
  if (user && user.status === "banned") return;

  const c = { env: e, chatId: chat.id, from, user, now: T.localNow(e) };
  if (cb) return onCallback(c, cb);
  if (msg.text) return onText(c, msg.text.trim());
}

/* ---------- текст ---------- */
async function onText(c, text) {
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
  if (cmd === "/start") return start(c);
  if (cmd === "/id") return send(c.env, c.chatId, `Твой chat id: <code>${c.chatId}</code>`);
  if (!c.user) return send(c.env, c.chatId, "👋 Чтобы пользоваться ботом, нажми /start");
  if (c.user.status === "pending") return pendingNotice(c);

  if (cmd === "/next" || text === "⏭ Следующая пара" || text === "⏭ Следующая") return nextCard(c.env, c.chatId, c.user, c.now);
  if (cmd === "/settings" || text === "⚙️ Настройки") return settings(c, "open");
  if (cmd === "/test") return preview(c);
  if (cmd === "/today") return showDay(c, c.now.iso);
  if (cmd === "/tomorrow") return showDay(c, T.isoAdd(c.now.iso, 1));
  if (cmd === "/week") return showWeek(c, T.weekStart(c.now.iso));
  if (cmd === "/where") return where(c, text.split(/\s+/).slice(1).join(" "));
  if (cmd === "/users" && c.user.status === "admin") return usersList(c);
  if (T.parseRoom(text)) return where(c, text);
  return help(c);
}

const help = c => send(c.env, c.chatId,
  "🔔 Напоминаю о каждой паре заранее: предмет, начало и кабинет на карте.\n\n" +
  "⏭ /next — следующая пара\n⚙️ /settings — когда напоминать\n👀 /test — пример напоминания\n\n" +
  "📍 Напиши номер кабинета, например <code>2.232P</code>, — покажу, где он",
  menuKeyboard(c.env, c.user.person));

/* ---------- регистрация ---------- */
async function start(c) {
  if (c.user) {
    if (c.user.status === "pending") return pendingNotice(c, true);
    return welcome(c.env, c.chatId, c.user, c.now);
  }
  if (await db.countUsers(c.env) >= +(c.env.MAX_USERS || 60))
    return send(c.env, c.chatId, "😔 Мест больше нет — бот только для своих.");
  const people = await loadPeople(c.env);
  return send(c.env, c.chatId,
    `👋 Привет, ${X.esc(c.from.first_name || "")}!\n\n` +
    "Я <b>Schedule</b> — напоминаю о парах и показываю, где кабинет.\n\n<b>Чьё расписание?</b>",
    { inline_keyboard: people.map(p => [{ text: p.owner + (p.group ? " · " + p.group : ""), callback_data: "p:" + p.slug }]) });
}

async function pickPerson(c, slug) {
  const people = await loadPeople(c.env);
  const p = people.find(x => x.slug === slug);
  if (!p) return "Такого расписания нет";

  if (c.user) {                                            // смена расписания
    await db.updateUser(c.env, c.chatId, { person: slug });
    if (c.user.status === "pending") return "Заявка ещё на рассмотрении";
    c.user.person = slug;
    await setMenuButton(c.env, c.chatId, slug);
    await show(c, `✅ Теперь расписание: <b>${X.esc(p.owner)}</b>`, null, true);
    await send(c.env, c.chatId, "Меню обновил 👇", menuKeyboard(c.env, slug));
    return "Готово";
  }

  if (await db.countUsers(c.env) >= +(c.env.MAX_USERS || 60)) {
    await show(c, "😔 Мест больше нет — бот только для своих.", null, true);
    return "";
  }
  const first = !(await db.adminExists(c.env));
  const status = first ? "admin" : (c.env.REGISTRATION === "open" ? "approved" : "pending");
  const name = [c.from.first_name, c.from.last_name].filter(Boolean).join(" ");
  await db.createUser(c.env, { chat_id: c.chatId, name, username: c.from.username, person: slug, status });
  const user = await db.getUser(c.env, c.chatId);

  if (user.status === "pending") {
    await show(c, `📝 <b>Заявка отправлена</b>\n\nКак только её подтвердят — начну напоминать о парах <b>${X.esc(p.owner)}</b>.`, null, true);
    await notifyAdmins(c.env, user, p);
    return "Заявка отправлена";
  }
  await show(c, `✅ Расписание: <b>${X.esc(p.owner)}</b>` +
    (user.status === "admin" ? "\n\n👑 Ты первый — ты админ. Новые заявки буду присылать сюда." : ""), null, true);
  await welcome(c.env, c.chatId, user, c.now);
  return "Добро пожаловать!";
}

async function welcome(e, chatId, user, now) {
  await setMenuButton(e, chatId, user.person);
  await send(e, chatId,
    `🔔 Буду напоминать о каждой паре <b>за ${user.lead_min || 20} мин</b>: предмет, время начала и кабинет на карте.\n\n` +
    "🌐 Расписание целиком — кнопка «Расписание». Время напоминаний — ⚙️ Настройки.\n" +
    "📍 Напиши номер кабинета, например <code>2.232P</code>, — покажу, где он.",
    menuKeyboard(e, user.person));
  return nextCard(e, chatId, user, now);
}

const setMenuButton = (e, chatId, slug) =>
  tg(e, "setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app", text: "Расписание", web_app: { url: site(e, slug) } } });

async function pendingNotice(c, force) {
  if (!force && Date.now() - (c.user.notified_at || 0) < 10 * 60000) return;   // не чаще раза в 10 минут
  await db.updateUser(c.env, c.chatId, { notified_at: Date.now() });
  return send(c.env, c.chatId, "⏳ Заявка ещё на рассмотрении — напишу, как только пустят.");
}

async function notifyAdmins(e, user, p) {
  for (const a of await db.admins(e)) {
    await send(e, a.chat_id,
      `🆕 <b>Заявка</b>\n\n${X.who(user)}\nхочет расписание: <b>${X.esc(p.owner)}</b>`,
      { inline_keyboard: [[
        { text: "✅ Пустить", callback_data: "a:ok:" + user.chat_id },
        { text: "❌ Отклонить", callback_data: "a:no:" + user.chat_id },
      ], [{ text: "🚫 Заблокировать", callback_data: "a:ban:" + user.chat_id }]] });
  }
}

async function admin(c, act, id) {
  if (c.user.status !== "admin") return "Только для админа";
  const target = await db.getUser(c.env, +id);
  if (!target) { await show(c, "Этой заявки уже нет", null, true); return ""; }
  if (act === "ok") {
    await db.updateUser(c.env, target.chat_id, { status: "approved" });
    await show(c, `✅ Пустил: ${X.who(target)}`, null, true);
    await send(c.env, target.chat_id, "🎉 <b>Заявку подтвердили!</b>");
    target.status = "approved";
    await welcome(c.env, target.chat_id, target, c.now);
    return "Пустил";
  }
  if (act === "no") {
    await db.deleteUser(c.env, target.chat_id);
    await show(c, `❌ Отклонил: ${X.who(target)}`, null, true);
    await send(c.env, target.chat_id, "Заявку отклонили.");
    return "Отклонил";
  }
  if (act === "ban") {
    await db.updateUser(c.env, target.chat_id, { status: "banned" });
    await show(c, `🚫 Заблокирован: ${X.who(target)}`, null, true);
    return "Заблокирован";
  }
  return "";
}

async function usersList(c) {
  const list = await db.allUsers(c.env);
  const icon = { admin: "👑", approved: "✅", pending: "⏳", banned: "🚫" };
  return send(c.env, c.chatId, `👥 <b>Пользователи: ${list.length}</b>\n\n` +
    list.map(u => `${icon[u.status] || "•"} ${X.who(u)} — ${X.esc(u.person || "")}`).join("\n"));
}

/* ---------- кнопки ---------- */
async function onCallback(c, cb) {
  c.mid = cb.message && cb.message.message_id;
  const [kind, a, b] = String(cb.data || "").split(":");
  let toast = "";
  if (kind === "p") toast = await pickPerson(c, a);
  else if (!c.user || c.user.status === "pending") toast = "Сначала регистрация — /start";
  else if (kind === "n") await nextCard(c.env, c.chatId, c.user, c.now);
  else if (kind === "t") await preview(c);
  else if (kind === "d") await showDay(c, a, true);
  else if (kind === "w") await showWeek(c, a, true);
  else if (kind === "s") toast = await settings(c, a, true);
  else if (kind === "a") toast = await admin(c, a, b);
  await tg(c.env, "answerCallbackQuery", { callback_query_id: cb.id, ...(toast ? { text: toast } : {}) });
}

/* ---------- экраны ---------- */
async function nextCard(e, chatId, user, now, customHead) {
  const S = await loadSchedule(e, user.person);
  if (!S) return send(e, chatId, "Расписание не нашлось — выбери заново в ⚙️ Настройках");
  const n = T.nextClass(S, now);
  if (!n) return send(e, chatId, "🏁 Пар больше нет — триместр позади");
  const when = n.iso === now.iso ? "" : n.iso === T.isoAdd(now.iso, 1) ? "завтра" : T.WHEN[T.keyOf(n.iso)];
  const head = customHead ||
    (n.live ? `🟢 <b>Идёт сейчас</b> · ещё ${T.dur(n.left)}` : `⏭ <b>Следующая пара</b> · через ${T.dur(n.wait)}`);
  return sendClassCard(e, chatId, user.person, head, n.g, [[{ text: "🔄 Обновить", callback_data: "n" }]], when);
}

const preview = c =>
  nextCard(c.env, c.chatId, c.user, c.now, `🔔 <b>Пара через ${c.user.lead_min || 20} мин</b>  <i>· так выглядит напоминание</i>`);

async function showDay(c, iso, edit) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) iso = c.now.iso;
  const S = await loadSchedule(c.env, c.user.person); if (!S) return;
  const prev = T.stepDay(iso, -1), next = T.stepDay(iso, 1);
  const kb = { inline_keyboard: [[
    { text: "◀️ " + T.dayLabel(prev), callback_data: "d:" + prev },
    { text: T.dayLabel(next) + " ▶️", callback_data: "d:" + next },
  ]] };
  return show(c, X.dayText(S, iso, c.now), kb, edit);
}

async function showWeek(c, ws, edit) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws || "")) ws = c.now.iso;
  ws = T.weekStart(ws);
  const S = await loadSchedule(c.env, c.user.person); if (!S) return;
  const kb = { inline_keyboard: [[
    { text: "◀️ Пред.", callback_data: "w:" + T.isoAdd(ws, -7) },
    { text: "След. ▶️", callback_data: "w:" + T.isoAdd(ws, 7) },
  ]] };
  return show(c, X.weekText(S, ws, c.now), kb, edit);
}

async function where(c, query) {
  const r = T.parseRoom(query);
  if (!r) return send(c.env, c.chatId, "Напиши номер кабинета, например <code>2.232P</code> или <code>1.355</code>");
  const S = await loadSchedule(c.env, c.user.person);
  const mine = [];
  if (S) for (const k of T.KEYS) for (const g of T.blocks(S, k))
    if (!g.it.online && T.mapKey(g.it.room) === T.mapKey(r.room))
      mine.push(`• ${T.SHORT[k]} в ${T.hhmm(g.rs)} — ${X.esc(g.it.subject)}`);
  const mineText = mine.length ? `\n\nУ тебя здесь:\n${mine.join("\n")}` : "";

  if (!r.main)
    return send(c.env, c.chatId, `🚪 Кабинет <b>${X.esc(r.room)}</b>\n\nПохоже, это не главный корпус (Коркем или другой) — на карте пока только C1.${mineText}`);

  const maps = await loadRoomMaps(c.env);
  const info = (maps.rooms || {})[T.mapKey(r.room)];
  const floor = info ? info.floor : T.floorOf(r.room), block = info ? info.block : T.blockOf(r.room);
  const caption = `🚪 Кабинет <b>${X.esc(T.roomShort(r.room))}</b> — ${floor} этаж, блок ${block}${mineText}`;
  const markup = { inline_keyboard: [[{ text: "🗺 Открыть на карте",
    web_app: { url: site(c.env, c.user.person, "?room=" + encodeURIComponent(T.roomShort(r.room))) } }]] };
  if (info) {
    const res = await sendPhoto(c.env, c.chatId, info.file, maps.version, caption, markup);
    if (res.ok) return res;
  }
  return send(c.env, c.chatId, caption, markup);
}

async function settings(c, what, edit) {
  const u = c.user;
  const people = await loadPeople(c.env);
  if (what === "person") {
    await show(c, "👤 <b>Чьё расписание?</b>", { inline_keyboard: [
      ...people.map(p => [{ text: (p.slug === u.person ? "• " : "") + p.owner + (p.group ? " · " + p.group : ""), callback_data: "p:" + p.slug }]),
      [{ text: "◀️ Назад", callback_data: "s:open" }],
    ] }, edit);
    return "";
  }
  let changed = false;
  if (what === "lead") {
    u.lead_min = cycle(LEADS, u.lead_min);
    await db.updateUser(c.env, c.chatId, { lead_min: u.lead_min });
    changed = true;
  }
  const owner = (people.find(p => p.slug === u.person) || {}).owner || u.person;
  await show(c, X.settingsText(u, owner), { inline_keyboard: [
    [{ text: "🔔 " + (u.lead_min ? "за " + u.lead_min + " мин" : "выключено"), callback_data: "s:lead" }],
    [{ text: "👀 Пример напоминания", callback_data: "t" }, { text: "👤 Сменить расписание", callback_data: "s:person" }],
  ] }, edit);
  return changed ? (u.lead_min ? `Напомню за ${u.lead_min} мин` : "Напоминания выключены") : "";
}
