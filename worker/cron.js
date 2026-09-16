/* Раз в минуту (Ticker): напоминания перед парами, календарь Moodle, настройка webhook */
import * as T from "./sched.js";
import * as X from "./text.js";
import * as db from "./db.js";
import * as M from "./msgs.js";
import * as moodle from "./moodle.js";
import { tg, webhookSecret } from "./tg.js";
import { loadSchedule, loader, sendClassCard, post } from "./bot.js";
import { t as dict, durIn, SUBJECT_EN } from "./i18n.js";

const BUDGET = 40;            // бесплатный план — до 50 запросов наружу за запуск
const DUE_LEADS = [24 * 60, 2 * 60];   // о дедлайне напоминаем за сутки и за два часа

export async function runCron(env, source = "cron") {
  if (!env.TELEGRAM_TOKEN || !env.DB) return;
  await db.setMeta(env, "tick_last", `${new Date().toISOString()} ${source}`);
  const hook = await ensureWebhook(env);
  if (!hook.ok) console.log("webhook не настроен:", hook.step, hook.error_code, hook.description);

  const now = T.localNow(env);
  const load = loader(env);
  let budget = BUDGET;

  for (const u of await db.activeUsers(env)) {
    if (budget <= 0) break;
    const S = await loadSchedule(env, u.person);

    /* напоминание перед парой */
    if (S && u.lead_min > 0) {
      for (const g of T.dayBlocks(S, now.iso)) {
        const t = g.rs - u.lead_min;
        if (now.min >= t && now.min < t + 5 && now.min < g.rs &&
            await db.markSent(env, u.chat_id, `${now.iso}:r:${g.rs}`)) {
          await sendClassCard(env, u.chat_id, u, g, now.iso, { kind: "soon", mins: g.rs - now.min });
          budget -= 2;
        }
      }
    }
    /* карточка прошлой пары сама переписывается, когда пара началась или закончилась */
    await M.tidy(env, u.chat_id, load).catch(() => {});
  }

  /* календари Moodle — по кругу, не чаще раза в минуту на человека */
  for (const u of await db.calendarUsers(env, Date.now() - 55000)) {
    if (budget <= 0) break;
    budget -= 2;
    await checkCalendar(env, u, now).catch(e => console.log("moodle", u.chat_id, String(e)));
  }

  /* раз в сутки чистим старые отметки */
  if (now.min >= 180 && now.min < 190 && await db.markSent(env, 0, `${now.iso}:cleanup`))
    await db.cleanupSent(env, now.ms - 3 * 86400000);
}

/* новые и перенесённые задания + напоминания о скором дедлайне */
async function checkCalendar(env, u, now) {
  const lang = u.lang === "en" ? "en" : "ru", L = dict(lang), off = +(env.TZ_OFFSET_MIN || 300);
  const initial = !u.cal_hash;                     // первое подключение: список и так покажем, молчим
  const r = await moodle.syncUser(env, u);
  if (!r || !r.ok) return;

  if (!initial) {
    const soon = list => list.filter(d => d.due > Date.now()).sort((a, b) => a.due - b.due).slice(0, 2);
    for (const d of soon(r.added || []))
      if (await db.markSent(env, u.chat_id, `dl:new:${d.uid}:${d.due}`))
        await post(env, u.chat_id, { kind: "deadline", text: deadlineText(L.new_deadline, d, lang, off) });
    for (const d of soon(r.moved || []))
      if (await db.markSent(env, u.chat_id, `dl:mv:${d.uid}:${d.due}`))
        await post(env, u.chat_id, { kind: "deadline", text: deadlineText(L.moved_deadline, d, lang, off) });
  }

  /* расхождение с нашим расписанием — не чаще раза в сутки */
  if (r.events && await db.markSent(env, u.chat_id, `${now.iso}:cmp`)) {
    const S = await loadSchedule(env, u.person);
    const diff = S ? compare(S, r.events, now, off, lang) : [];
    if (diff.length)
      await post(env, u.chat_id, { text: `${L.moodle_diff}\n\n${diff.slice(0, 5).join("\n")}\n\n<i>${L.moodle_diff_note}</i>` });
  }

  /* за сутки и за два часа до сдачи */
  for (const d of await moodle.upcoming(env, u.chat_id, Date.now(), 10)) {
    const left = Math.round((d.due - Date.now()) / 60000);
    for (const lead of DUE_LEADS)
      if (left > lead - 5 && left <= lead && await db.markSent(env, u.chat_id, `dl:${lead}:${d.uid}:${d.due}`))
        await post(env, u.chat_id, { kind: "deadline",
          text: deadlineText(L.due_soon(durIn(left, lang)), d, lang, off) });
  }
}

function deadlineText(head, d, lang, off) {
  const at = new Date(d.due + off * 60000), L = dict(lang);
  const when = `${at.getUTCDate()} ${L.monthsShort[at.getUTCMonth()]}, ` +
    `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
  return `${head}\n\n📌 <b>${X.esc(String(d.title).replace(/ is due$/i, ""))}</b>\n` +
         `<i>${X.esc(d.subject || "")}</i>\n🕐 ${when}`;
}

/* занятия из Moodle против нашего расписания на ближайшую неделю */
function compare(S, events, now, off, lang) {
  const out = [];
  const ours = new Set();                          // сверяем только предметы, которые есть у нас
  for (const k of T.KEYS) for (const g of T.blocks(S, k)) {
    ours.add(g.it.subject.toLowerCase());
    const en = SUBJECT_EN[g.it.subject];
    if (en) ours.add(en.toLowerCase());
  }
  for (const e of events) {
    if (!moodle.isClass(e) || !ours.has(String(e.subject || "").toLowerCase())) continue;
    const local = new Date(e.due + off * 60000);
    const iso = local.toISOString().slice(0, 10);
    const min = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (iso < now.iso || iso > T.isoAdd(now.iso, 7)) continue;
    const list = T.dayBlocks(S, iso);
    if (!list.length) continue;                               // выходной или каникулы — не наше дело
    if (list.some(g => Math.abs(g.rs - min) <= 20)) continue;
    out.push(`• ${X.fmtShort(iso, lang)} ${T.hhmm(min)} — ${X.esc(e.subject || e.title)}`);
  }
  return out;
}

/* webhook, команды и описание — один раз и заново при смене токена или версии. */
export async function ensureWebhook(env, force = false) {
  const secret = await webhookSecret(env.TELEGRAM_TOKEN);
  const url = env.PUBLIC_URL + "/tg/webhook";
  const want = `${url}|${secret.slice(0, 16)}|v3`;
  const prev = await db.getMeta(env, "webhook");
  if (!force && prev === want) return { ok: true, cached: true };

  const me = await tg(env, "getMe");
  if (!me.ok) {
    await db.setMeta(env, "last_error", `getMe ${me.error_code || ""} ${me.description || "нет ответа"}`);
    return { ok: false, step: "getMe", error_code: me.error_code, description: me.description };
  }
  const r = await tg(env, "setWebhook", {
    url, secret_token: secret, max_connections: 10,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: !force && !prev,
  });
  if (!r.ok) {
    await db.setMeta(env, "last_error", `setWebhook ${r.error_code || ""} ${r.description || ""}`);
    return { ok: false, step: "setWebhook", error_code: r.error_code, description: r.description };
  }
  await tg(env, "setMyCommands", { commands: [
    { command: "next", description: "Следующая пара и кабинет на карте" },
    { command: "today", description: "Весь сегодняшний день одной картинкой" },
    { command: "deadlines", description: "Дедлайны из Moodle" },
    { command: "settings", description: "Напоминания, язык, расписание" },
    { command: "start", description: "Вход по баркоду" },
  ] });
  await tg(env, "setMyDescription", { description:
    "Schedule — напоминания о парах AITU.\n\n🔔 Перед парой: предмет, время и кабинет на карте корпуса.\n📚 Дедлайны из Moodle.\n🌐 Расписание целиком — на сайте." });
  await tg(env, "setMyShortDescription", { short_description: "Напоминания о парах с картой кабинета" });
  await db.setMeta(env, "webhook", want);
  await db.setMeta(env, "last_error", "");
  const info = await tg(env, "getWebhookInfo");
  const w = info.result || {};
  return { ok: true, bot: "@" + me.result.username, webhook: w.url,
           pending_updates: w.pending_update_count, last_error: w.last_error_message || null };
}
