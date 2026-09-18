#!/usr/bin/env node
/* Для бота: public/<имя>/schedule.js → schedule.json и общий список people.json.
   Запускается вместе с build-pages.py перед деплоем. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

/* читаем все расписания */
const raw = new Map();
for (const slug of fs.readdirSync(PUB)) {
  const src = path.join(PUB, slug, "schedule.js");
  if (!/^[a-z0-9-]+$/.test(slug) || !fs.existsSync(src)) continue;
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(src, "utf8"), box, { filename: src });
  if (!box.window.SCHEDULE) throw new Error(`${src}: нет window.SCHEDULE`);
  raw.set(slug, box.window.SCHEDULE);
}

/* alias — берём пары у другого человека, свои остаются owner/barcode/hidden */
const resolve = (slug, seen = new Set()) => {
  const S = raw.get(slug);
  if (!S.aliasOf) return S;
  if (seen.has(slug)) throw new Error(`${slug}: aliasOf зациклен`);
  const base = resolve(S.aliasOf, seen.add(slug));
  const merged = { ...base, ...S };
  delete merged.aliasOf;
  if (!S.private) delete merged.private;      // «закрыто» не наследуется по aliasOf
  return merged;
};

const order = [...raw.keys()].sort((a, b) => (a !== "nurali") - (b !== "nurali") || a.localeCompare(b));
const people = [];
for (const slug of order) {
  const S = resolve(slug);
  if (!S.days) throw new Error(`${slug}: нет расписания (days)`);
  fs.writeFileSync(path.join(PUB, slug, "schedule.json"), JSON.stringify(S));
  people.push({ slug, owner: S.owner || slug, group: S.group || "",
                barcode: String(S.barcode || ""), hidden: !!(S.hidden || S.private), private: !!S.private });
}

fs.writeFileSync(path.join(PUB, "people.json"), JSON.stringify(people, null, 2) + "\n");
console.log("json для бота:", people.map(p => p.slug + (p.barcode ? ` (${p.barcode})` : "")).join(", "));
