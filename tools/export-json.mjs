#!/usr/bin/env node
/* Для бота: public/<имя>/schedule.js → schedule.json и общий список people.json.
   Запускается вместе с build-pages.py перед деплоем. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const people = [];

for (const slug of fs.readdirSync(PUB).sort((a, b) => (a !== "nurali") - (b !== "nurali") || a.localeCompare(b))) {
  const src = path.join(PUB, slug, "schedule.js");
  if (!/^[a-z0-9-]+$/.test(slug) || !fs.existsSync(src)) continue;
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(src, "utf8"), box, { filename: src });
  const S = box.window.SCHEDULE;
  if (!S || !S.days) throw new Error(`${src}: нет window.SCHEDULE.days`);
  fs.writeFileSync(path.join(PUB, slug, "schedule.json"), JSON.stringify(S));
  people.push({ slug, owner: S.owner || slug, group: S.group || "" });
}

fs.writeFileSync(path.join(PUB, "people.json"), JSON.stringify(people, null, 2) + "\n");
console.log("json для бота:", people.map(p => p.slug).join(", "));
