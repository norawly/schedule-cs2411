/* Воркер Schedule: сайт отдаётся статикой, /tg/webhook — Telegram-бот, cron — напоминания */
import { handleUpdate } from "./bot.js";
import { runCron } from "./cron.js";
import { webhookSecret } from "./tg.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
