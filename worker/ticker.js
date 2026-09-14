/* Будильник раз в минуту на Durable Object.
   Cron-триггер Cloudflare для этого воркера не срабатывает, а alarm у Durable Object — надёжно:
   каждый запуск делает свою работу и сам заводит следующий. */
import { DurableObject } from "cloudflare:workers";
import { runCron } from "./cron.js";

const nextMinute = () => (Math.floor(Date.now() / 60000) + 1) * 60000 + 2000;

export class Ticker extends DurableObject {
  /* завести будильник, если его нет (или он «застрял» в прошлом) */
  async fetch() {
    let at = await this.ctx.storage.getAlarm();
    if (at == null || at < Date.now() - 120000) {
      at = nextMinute();
      await this.ctx.storage.setAlarm(at);
    }
    return Response.json({ next_tick: new Date(at).toISOString() });
  }

  async alarm() {
    try {
      await runCron(this.env, "alarm");
    } catch (e) {
      console.log("tick failed", e && e.stack || e);
    } finally {
      await this.ctx.storage.setAlarm(nextMinute());
    }
  }
}
