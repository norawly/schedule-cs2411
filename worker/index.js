/* Воркер Schedule: сайт отдаётся статикой, /tg/webhook — Telegram-бот, cron — напоминания */
import { handleUpdate } from "./bot.js";
import { runCron, ensureWebhook } from "./cron.js";
import { tg, webhookSecret } from "./tg.js";
import * as db from "./db.js";

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function limited(env, key) {
  if (!env.RL) return false;
  const { success } = await env.RL.limit({ key });
  return !success;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* подключить webhook прямо сейчас и показать ответ Telegram (без токена) */
    if (url.pathname === "/tg/setup") {
      if (!env.TELEGRAM_TOKEN) return json({ ok: false, error: "TELEGRAM_TOKEN не задан" }, 503);
      if (await limited(env, "setup")) return json({ ok: false, error: "слишком часто, подожди минуту" }, 429);
      return json(await ensureWebhook(env, true));
    }

    /* состояние бота — только чтение, ничего не меняет */
    if (url.pathname === "/tg/status") {
      if (!env.TELEGRAM_TOKEN) return json({ ok: false, error: "TELEGRAM_TOKEN не задан" }, 503);
      if (await limited(env, "status")) return json({ ok: false, error: "слишком часто, подожди минуту" }, 429);
      const info = await tg(env, "getWebhookInfo");
      const w = info.result || {};
      const rows = (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM users GROUP BY status").all()).results;
      return json({
        ok: !!info.ok,
        webhook: w.url || null,
        pending_updates: w.pending_update_count,
        last_error: w.last_error_message || null,
        last_error_at: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null,
        users: Object.fromEntries(rows.map(r => [r.status, r.n])),
        cron_last_run: await db.getMeta(env, "cron_last"),
      });
    }

    if (url.pathname === "/tg/webhook") {
      if (request.method !== "POST") return new Response("ok");
      if (!env.TELEGRAM_TOKEN) return new Response("bot token is not set", { status: 503 });
      const secret = await webhookSecret(env.TELEGRAM_TOKEN);
      if (request.headers.get("x-telegram-bot-api-secret-token") !== secret)
        return new Response("forbidden", { status: 403 });

      const update = await request.json().catch(() => null);
      if (update) ctx.waitUntil(handleUpdate(env, update).catch(e => console.log("update failed", e && e.stack || e)));
      return new Response("ok");                 // Telegram ждёт быстрый ответ
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env).catch(e => console.log("cron failed", e && e.stack || e)));
  },
};
