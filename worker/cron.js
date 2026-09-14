/* Раз в минуту (Ticker): напоминания перед парами с картинкой карты, настройка webhook */
import * as T from "./sched.js";
import * as db from "./db.js";
import { tg, webhookSecret } from "./tg.js";
import { loadSchedule, sendClassCard } from "./bot.js";

const BUDGET = 40;   // бесплатный план — до 50 запросов наружу за запуск

export async function runCron(env, source = "cron") {
  if (!env.TELEGRAM_TOKEN || !env.DB) return;
  await db.setMeta(env, "tick_last", `${new Date().toISOString()} ${source}`);
  const hook = await ensureWebhook(env);
  if (!hook.ok) console.log("webhook не настроен:", hook.step, hook.error_code, hook.description);

  const now = T.localNow(env);
  let budget = BUDGET;

  for (const u of await db.activeUsers(env)) {
    if (budget <= 0) break;
    if (!(u.lead_min > 0)) continue;
    const S = await loadSchedule(env, u.person);
    if (!S) continue;
    for (const g of T.dayBlocks(S, now.iso)) {
      const t = g.rs - u.lead_min;
      if (now.min >= t && now.min < t + 5 && now.min < g.rs &&
          await db.markSent(env, u.chat_id, `${now.iso}:r:${g.rs}`)) {
        await sendClassCard(env, u.chat_id, u.person, `🔔 <b>Пара через ${g.rs - now.min} мин</b>`, g);
        budget--;
      }
    }
  }

  /* раз в сутки чистим старые отметки */
  if (now.min >= 180 && now.min < 190 && await db.markSent(env, 0, `${now.iso}:cleanup`))
    await db.cleanupSent(env, now.ms - 3 * 86400000);
}

/* webhook, команды и описание — один раз и заново при смене токена или версии.
   force — настроить прямо сейчас (из /tg/setup), результат возвращается без токена. */
export async function ensureWebhook(env, force = false) {
  const secret = await webhookSecret(env.TELEGRAM_TOKEN);
  const url = env.PUBLIC_URL + "/tg/webhook";
  const want = `${url}|${secret.slice(0, 16)}|v2`;
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
    drop_pending_updates: !force && !prev,      // сбрасываем очередь только при самом первом подключении
  });
  if (!r.ok) {
    await db.setMeta(env, "last_error", `setWebhook ${r.error_code || ""} ${r.description || ""}`);
    return { ok: false, step: "setWebhook", error_code: r.error_code, description: r.description };
  }
  await tg(env, "setMyCommands", { commands: [
    { command: "next", description: "Следующая пара и кабинет на карте" },
    { command: "settings", description: "Когда напоминать и чьё расписание" },
    { command: "test", description: "Показать, как выглядит напоминание" },
    { command: "start", description: "Регистрация и меню" },
  ] });
  await tg(env, "setMyDescription", { description:
    "Schedule — напоминания о парах AITU.\n\n🔔 За 20 минут до пары: предмет, время начала и кабинет на карте корпуса.\n🌐 Расписание целиком — на сайте." });
  await tg(env, "setMyShortDescription", { short_description: "Напоминания о парах с картой кабинета" });
  await db.setMeta(env, "webhook", want);
  await db.setMeta(env, "last_error", "");
  const info = await tg(env, "getWebhookInfo");
  const w = info.result || {};
  return { ok: true, bot: "@" + me.result.username, webhook: w.url,
           pending_updates: w.pending_update_count, last_error: w.last_error_message || null };
}
