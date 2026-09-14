/* Раз в минуту: напоминания перед парами, утренняя и вечерняя сводки, настройка webhook */
import * as T from "./sched.js";
import * as X from "./text.js";
import * as db from "./db.js";
import { tg, webhookSecret } from "./tg.js";
import { loadSchedule, send, classButtons } from "./bot.js";

const BUDGET = 40;   // бесплатный план — до 50 запросов наружу за запуск

export async function runCron(env) {
  if (!env.TELEGRAM_TOKEN || !env.DB) return;
  await ensureWebhook(env);

  const now = T.localNow(env);
  let budget = BUDGET;
  const users = await db.activeUsers(env);

  for (const u of users) {
    if (budget <= 0) break;
    const S = await loadSchedule(env, u.person);
    if (!S) continue;
    const today = T.dayBlocks(S, now.iso);

    /* перед парой */
    if (u.lead_min > 0) {
      for (const g of today) {
        const t = g.rs - u.lead_min;
        if (now.min >= t && now.min < t + 5 && now.min < g.rs &&
            await db.markSent(env, u.chat_id, `${now.iso}:r:${g.rs}`)) {
          const btn = classButtons(env, u.person, g.it);
          await send(env, u.chat_id, X.reminderText(g, g.rs - now.min),
            btn.length ? { inline_keyboard: [btn] } : undefined);
          budget--;
        }
      }
    }

    /* утром — пары на день */
    if (u.morning >= 0 && today.length && now.min >= u.morning && now.min < u.morning + 15 &&
        await db.markSent(env, u.chat_id, `${now.iso}:m`)) {
      await send(env, u.chat_id, "☀️ Доброе утро!\n\n" + X.dayText(S, now.iso, now),
        { inline_keyboard: [[{ text: "⏭ Следующая", callback_data: "n" }, { text: "🗓 Неделя", callback_data: "w:" + T.weekStart(now.iso) }]] });
      budget--;
    }

    /* вечером — на завтра */
    if (u.evening >= 0 && now.min >= u.evening && now.min < u.evening + 15) {
      const ev = X.eveningText(S, now);
      if (ev && await db.markSent(env, u.chat_id, `${now.iso}:e`)) {
        await send(env, u.chat_id, ev.text, { inline_keyboard: [[{ text: "📅 Открыть день", callback_data: "d:" + ev.iso }]] });
        budget--;
      }
    }
  }

  /* раз в сутки чистим старые отметки */
  if (now.min >= 180 && now.min < 190 && await db.markSent(env, 0, `${now.iso}:cleanup`))
    await db.cleanupSent(env, now.ms - 3 * 86400000);
}

/* webhook, команды и описание — один раз и заново при смене токена */
async function ensureWebhook(env) {
  const secret = await webhookSecret(env.TELEGRAM_TOKEN);
  const url = env.PUBLIC_URL + "/tg/webhook";
  const want = `${url}|${secret.slice(0, 16)}|v1`;
  if (await db.getMeta(env, "webhook") === want) return;

  const r = await tg(env, "setWebhook", {
    url, secret_token: secret, max_connections: 10,
    allowed_updates: ["message", "callback_query"], drop_pending_updates: true,
  });
  if (!r.ok) return;
  await tg(env, "setMyCommands", { commands: [
    { command: "today", description: "Пары на сегодня" },
    { command: "tomorrow", description: "Пары на завтра" },
    { command: "next", description: "Следующая пара и кабинет" },
    { command: "week", description: "Вся неделя" },
    { command: "settings", description: "Напоминания и расписание" },
    { command: "start", description: "Регистрация и меню" },
  ] });
  await tg(env, "setMyDescription", { description:
    "Schedule — расписание пар AITU.\n\n⏰ Напоминания перед парой\n📍 Кабинет и где он на карте\n☀️ Пары на день утром, 🌙 на завтра вечером" });
  await tg(env, "setMyShortDescription", { short_description: "Расписание пар, кабинеты и напоминания" });
  await db.setMeta(env, "webhook", want);
  console.log("webhook настроен:", url);
}
