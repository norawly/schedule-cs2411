#!/usr/bin/env node
/* «Календарь на сегодня» для бота: весь день одной картинкой.
   Пишет public/map/days/<хэш>.png и index.json: "<имя>|<день>|<язык>" → файл.
   Картинок мало: расписание постоянное, поэтому рисуем заранее, а не в воркере. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { KEYS, blocks, hhmm, roomShort, floorOf, blockOf } from "../worker/sched.js";
import { t as dict, subject as subjectName, placeName } from "../worker/i18n.js";

let Resvg;
try { ({ Resvg } = await import("@resvg/resvg-js")); }
catch { console.log("календарь дня: нет @resvg/resvg-js (npm install) — оставляю готовые картинки"); process.exit(0); }

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const OUT = path.join(PUB, "map", "days");
const W = 1280, H = 960, FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const KIND = {
  "lecture":         "#3b68e0",
  "practice":        "#1a9e5f",
  "lecture-online":  "#7c5cf0",
  "practice-online": "#c97a10",
  "other":           "#6b7280",
};
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* грубая ширина строки в пикселях — чтобы обрезать длинные названия */
const width = (s, size) => [...String(s)].reduce((w, ch) => w + (/[a-zа-яё0-9 ,.\-]/i.test(ch) ? 0.52 : 0.62), 0) * size;
function fit(s, size, max) {
  let out = String(s);
  while (out.length > 4 && width(out, size) > max) out = out.slice(0, -2);
  return out === String(s) ? out : out.trim() + "…";
}

/* строка «где это»: кабинет, этаж и блок — или «Онлайн» */
function place(it, L, lang) {
  if (it.online) return L.online;
  if (!it.room) return "";
  const bits = [placeName(roomShort(it.room), lang)];
  const fl = floorOf(it.room), bl = blockOf(it.room);
  if (it.building && !/главный/i.test(it.building)) bits.push(placeName(it.building, lang));
  else if (/^\d/.test(bits[0])) {                    // номер кабинета — подскажем этаж и блок
    if (fl) bits.push(L.floorAt(fl));
    if (bl) bits.push(L.blockAt(bl));
  }
  return bits.join(" · ");
}

function card(S, key, lang) {
  const L = dict(lang), gs = blocks(S, key);
  const day = L.days[KEYS.indexOf(key)];
  const span = `${hhmm(gs[0].rs)} – ${hhmm(gs[gs.length - 1].re)}`;

  const area = [214, H - 74], gap = 16, GAPH = 56;
  /* между парами показываем окна — их видно сразу */
  const items = [];
  gs.forEach((g, i) => {
    if (i) { const free = g.rs - gs[i - 1].re; if (free >= 45) items.push({ free }); }
    items.push({ g });
  });
  const nCls = gs.length, nGap = items.length - nCls;
  const h = Math.min(176, (area[1] - area[0] - gap * (items.length - 1) - GAPH * nGap) / nCls);
  const total = h * nCls + GAPH * nGap + gap * (items.length - 1);
  let y = area[0] + (area[1] - area[0] - total) / 2;

  const rows = items.map(item => {
    if (item.free) {
      const mins = item.free, txt = (mins >= 60 ? `${Math.floor(mins / 60)} ${L.h}` : "") + (mins % 60 ? ` ${mins % 60} ${L.min}` : "");
      const box = `<g>
        <rect x="40" y="${y}" width="${W - 80}" height="${GAPH}" rx="16" fill="#101318" stroke="#20242b" stroke-width="1.5" stroke-dasharray="10 8"/>
        <text x="${W / 2}" y="${y + GAPH / 2 + 10}" font-size="27" font-weight="600" fill="#6b7384" text-anchor="middle">${esc(L.window)} ${esc(txt.trim())}</text>
      </g>`;
      y += GAPH + gap;
      return box;
    }
    const g = item.g, it = g.it;
    const color = it.type === "other" ? KIND.other : KIND[(it.type === "lecture" ? "lecture" : "practice") + (it.online ? "-online" : "")] || KIND.practice;
    const title = fit(subjectName(it.subject, lang), 38, 700);
    const type = L[it.type] || L.practice;
    const shift = h > 150 ? 0 : (150 - h) / 2;
    const box = `<g>
      <rect x="40" y="${y}" width="${W - 80}" height="${h}" rx="22" fill="#171a20" stroke="#262a31" stroke-width="1.5"/>
      <rect x="40" y="${y}" width="7" height="${h}" rx="3.5" fill="${color}"/>
      <text x="76" y="${y + 52 - shift * .4}" font-size="34" font-weight="700" fill="#e7e9ec">${esc(hhmm(g.rs))}</text>
      <text x="76" y="${y + 92 - shift * .5}" font-size="30" font-weight="500" fill="#949aa4">${esc(hhmm(g.re))}</text>
      <rect x="248" y="${y + 26}" width="1.5" height="${h - 52}" fill="#262a31"/>
      <text x="288" y="${y + 56 - shift * .4}" font-size="38" font-weight="650" fill="#ffffff">${esc(title)}</text>
      <text x="288" y="${y + 100 - shift * .5}" font-size="29" font-weight="600" fill="${color}">${esc(place(it, L, lang))}</text>
      <text x="${W - 76}" y="${y + 100 - shift * .5}" font-size="27" font-weight="500" fill="#949aa4" text-anchor="end">${esc(type)}</text>
      ${it.code ? `<text x="${W - 76}" y="${y + 56 - shift * .4}" font-size="24" font-weight="500" fill="#6b7384" text-anchor="end">${esc(it.code)}</text>` : ""}
    </g>`;
    y += h + gap;
    return box;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#0e1013"/>
  <text x="44" y="96" font-size="64" font-weight="800" fill="#ffffff">${esc(day)}</text>
  <text x="44" y="146" font-size="30" font-weight="500" fill="#949aa4">${esc(S.group || S.owner || "")} · ${esc(span)}</text>
  <rect x="44" y="176" width="${W - 88}" height="1.5" fill="#262a31"/>
  ${rows}
  <text x="${W - 44}" y="${H - 28}" font-size="22" font-weight="500" fill="#6b7384" text-anchor="end">s.zhengisbay.com</text>
</svg>`;
}

/* расписания (с учётом aliasOf) */
const raw = new Map();
for (const slug of fs.readdirSync(PUB)) {
  const src = path.join(PUB, slug, "schedule.js");
  if (!/^[a-z0-9-]+$/.test(slug) || !fs.existsSync(src)) continue;
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(src, "utf8"), box);
  raw.set(slug, box.window.SCHEDULE);
}
const resolve = slug => {
  const S = raw.get(slug);
  return S.aliasOf ? { ...resolve(S.aliasOf), ...S } : S;
};

fs.mkdirSync(OUT, { recursive: true });
const manifest = { cards: {} }, files = new Set(), hash = crypto.createHash("sha1");
for (const slug of [...raw.keys()].sort()) {
  const S = resolve(slug);
  for (const key of KEYS) {
    if (!blocks(S, key).length) continue;                       // пустой день — бот ответит текстом
    for (const lang of ["ru", "en"]) {
      const svg = card(S, key, lang);
      const file = crypto.createHash("sha1").update(svg).digest("hex").slice(0, 12) + ".png";
      if (!files.has(file)) {
        const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "Helvetica Neue" } }).render().asPng();
        fs.writeFileSync(path.join(OUT, file), png);
        hash.update(png);
        files.add(file);
      }
      manifest.cards[`${slug}|${key}|${lang}`] = file;
    }
  }
}
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".png") && !files.has(f)) fs.unlinkSync(path.join(OUT, f));
manifest.version = hash.digest("hex").slice(0, 10);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`календарь дня: ${files.size} картинок, версия ${manifest.version}`);
