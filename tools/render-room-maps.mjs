#!/usr/bin/env node
/* Картинки карты для напоминаний бота: по PNG на каждый кабинет главного корпуса из расписаний.
   Пишет public/map/rooms/<номер>.png и index.json (номер кабинета → файл, этаж, блок).
   Нужен @resvg/resvg-js (npm install); без него готовые картинки просто остаются как есть. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

let Resvg;
try { ({ Resvg } = await import("@resvg/resvg-js")); }
catch { console.log("карты для бота: нет @resvg/resvg-js (npm install) — оставляю готовые картинки"); process.exit(0); }

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const OUT = path.join(PUB, "map", "rooms");
const D = JSON.parse(fs.readFileSync(path.join(PUB, "map", "floors.json"), "utf8"));

const W = 1280, H = 960, ACCENT = "#ff7849", FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

/* номер без буквы на конце: C1.2.221K → «2.221»; названия — в нижнем регистре */
const mapKey = room => {
  const t = String(room || "").trim();
  const m = t.match(/^(?:C1\.)?(\d)\.(\d{2,4})[A-Za-zА-Яа-я]?$/i);
  return m ? `${m[1]}.${m[2]}` : t.toLowerCase();
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pts = p => p.map(q => q.join(",")).join(" ");
function bbox(list) {
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const poly of list) for (const [x, y] of poly) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}
const PLAN = bbox(D.floors.flatMap(f => [...f.rooms.map(r => r.poly), ...f.zones.map(z => z.p)]));

function locate(room) {
  const k = mapKey(room);
  for (const f of D.floors) for (const r of f.rooms) {
    if (mapKey(r.id) === k) return { f, r };
    if ([r.title, ...(r.alt || [])].filter(Boolean).some(n => n.toLowerCase() === k)) return { f, r };
  }
  return null;
}

/* кабинеты из всех расписаний, только главный корпус */
const wanted = new Map();
for (const slug of fs.readdirSync(PUB)) {
  const src = path.join(PUB, slug, "schedule.js");
  if (!fs.existsSync(src)) continue;
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(src, "utf8"), box);
  for (const day of Object.values((box.window.SCHEDULE || {}).days || {})) for (const it of day) {
    if (it.online || !it.room || (it.building && !/главный/i.test(it.building))) continue;
    if (!wanted.has(mapKey(it.room))) wanted.set(mapKey(it.room), it.room.replace(/^C1\./i, ""));
  }
}

const ZONE = { techs: "#232a36", void: "#232a36", wcs: "#2c2842", stairs: "#1b212b", escapes: "#17321f",
               gym: "#162c3b", "gym-pole": "#162c3b", "coworking-atameken": "#1e2430" };
const ICON = { wcs: "#7c5cf0", stairs: "#2f6feb", escapes: "#16a34a" };

function compose(f, r, label) {
  const b = bbox([r.poly]);
  const cw = 430, ch = cw * H / W, u = cw / W;             // u — единиц плана на пиксель
  const x = Math.max(PLAN.x1 - 20, Math.min(b.cx - cw / 2, PLAN.x2 + 20 - cw));
  const y = Math.max(PLAN.y1 - 30, Math.min(b.cy - ch / 2 + 12, PLAN.y2 + 30 - ch));
  const block = (r.id.match(/^C1\.(\d)\./i) || [])[1];
  const place = `${f.level} этаж` + (block ? ` · блок C1.${block}` : "");

  const building = D.common.building.map(p =>
    `<path d="${p.d}"${p.t ? ` transform="${p.t}"` : ""} fill="#151a22" stroke="#3a4354" stroke-width="${2.2 * u}"/>`).join("");
  const blocks = D.common.labels.map(p =>
    `<path d="${p.d}"${p.t ? ` transform="${p.t}"` : ""} fill="#ffffff" fill-opacity="0.05"/>`).join("");
  const zones = f.zones.map(z =>
    `<${z.closed ? "polygon" : "polyline"} points="${pts(z.p)}" fill="${z.closed ? (ZONE[z.k] || "none") : "none"}" stroke="#2f3747" stroke-width="${1.2 * u}"/>`).join("");
  const rooms = f.rooms.filter(q => q !== r).map(q => {
    const qb = bbox([q.poly]);
    const text = q.title || q.id.replace(/^C1\.\d\./i, "");
    const lbl = (qb.w > 11 || qb.h > 11)
      ? `<text x="${qb.cx}" y="${qb.cy + 1.5}" font-size="${q.title ? 5.2 : 4.3}" font-weight="${q.title ? 700 : 500}" fill="#8fa6cf" text-anchor="middle">${esc(text)}</text>` : "";
    return `<polygon points="${pts(q.poly)}" fill="#20324f" stroke="#35507c" stroke-width="${1.2 * u}"/>${lbl}`;
  }).join("");
  const icons = (f.icons || []).map(ic =>
    `<g>${ic.paths.map((p, i) => `<path d="${p.d}"${p.t ? ` transform="${p.t}"` : ""} fill="${i ? "#ffffff" : (ICON[ic.k] || "#5b6472")}"/>`).join("")}</g>`).join("");
  const ring = Math.max(b.w, b.h) / 2 + 7;
  const hlText = r.title || r.id.replace(/^C1\.\d\./i, "");
  const highlight =
    `<polygon points="${pts(r.poly)}" fill="${ACCENT}" filter="url(#glow)" opacity="0.9"/>` +
    `<circle cx="${b.cx}" cy="${b.cy}" r="${ring}" fill="none" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="${3 * u}"/>` +
    `<circle cx="${b.cx}" cy="${b.cy}" r="${ring + 6}" fill="none" stroke="${ACCENT}" stroke-opacity="0.22" stroke-width="${2 * u}"/>` +
    `<polygon points="${pts(r.poly)}" fill="${ACCENT}" stroke="#ffffff" stroke-width="${2.6 * u}"/>` +
    `<text x="${b.cx}" y="${b.cy + 2.1}" font-size="${r.title ? 7 : 6}" font-weight="800" fill="#ffffff" text-anchor="middle">${esc(hlText)}</text>`;

  const pillW = 96 + place.length * 13.5;
  const cardW = Math.max(270, 72 + label.length * 33);
  const cy0 = H - 28 - 128;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <defs>
    <filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="${7 * u}"/></filter>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0e13" stop-opacity="0.85"/><stop offset="1" stop-color="#0b0e13" stop-opacity="0"/></linearGradient>
    <linearGradient id="bottom" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0b0e13" stop-opacity="0.9"/><stop offset="1" stop-color="#0b0e13" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0e1013"/>
  <svg width="${W}" height="${H}" viewBox="${x} ${y} ${cw} ${ch}" preserveAspectRatio="xMidYMid slice">
    ${building}${blocks}${zones}${rooms}${icons}${highlight}
  </svg>
  <rect width="${W}" height="150" fill="url(#top)"/>
  <rect y="${H - 190}" width="${W}" height="190" fill="url(#bottom)"/>

  <rect x="28" y="28" width="${pillW}" height="58" rx="29" fill="#0b0e13" fill-opacity="0.88" stroke="#2f3747" stroke-width="1.5"/>
  <circle cx="60" cy="57" r="8" fill="${ACCENT}"/>
  <text x="80" y="66" font-size="26" font-weight="600" fill="#e8ebf2">${esc(place)}</text>

  <g transform="translate(${W - 28 - 300},28)">
    <rect width="300" height="134" rx="18" fill="#0b0e13" fill-opacity="0.88" stroke="#2f3747" stroke-width="1.5"/>
    <svg x="14" y="12" width="272" height="110" viewBox="${PLAN.x1 - 12} ${PLAN.y1 - 12} ${PLAN.w + 24} ${PLAN.h + 24}" preserveAspectRatio="xMidYMid meet">
      ${D.common.building.map(p => `<path d="${p.d}"${p.t ? ` transform="${p.t}"` : ""} fill="#262d3a" stroke="#465063" stroke-width="3"/>`).join("")}
      <rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="12 9"/>
      <circle cx="${b.cx}" cy="${b.cy}" r="36" fill="${ACCENT}" fill-opacity="0.3"/>
      <circle cx="${b.cx}" cy="${b.cy}" r="15" fill="${ACCENT}"/>
    </svg>
  </g>

  <rect x="28" y="${cy0}" width="${cardW}" height="128" rx="24" fill="#0b0e13" fill-opacity="0.92" stroke="#2f3747" stroke-width="1.5"/>
  <rect x="28" y="${cy0 + 22}" width="8" height="84" rx="4" fill="${ACCENT}"/>
  <text x="60" y="${cy0 + 45}" font-size="19" font-weight="700" letter-spacing="3" fill="#8a94a8">КАБИНЕТ</text>
  <text x="57" y="${cy0 + 104}" font-size="58" font-weight="800" fill="#ffffff">${esc(label)}</text>
  <text x="${W - 30}" y="${H - 34}" font-size="19" font-weight="500" fill="#6b7384" text-anchor="end">s.zhengisbay.com</text>
</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = { rooms: {} }, files = new Set(), hash = crypto.createHash("sha1");
for (const [key, label] of wanted) {
  const hit = locate(key);
  if (!hit) { console.log("  нет на плане:", label); continue; }
  const file = mapKey(hit.r.id).replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png";
  if (!files.has(file)) {
    const png = new Resvg(compose(hit.f, hit.r, label), { font: { loadSystemFonts: true, defaultFontFamily: "Helvetica Neue" } }).render().asPng();
    fs.writeFileSync(path.join(OUT, file), png);
    hash.update(png);
    files.add(file);
  }
  const block = (hit.r.id.match(/^C1\.(\d)\./i) || [])[1];
  manifest.rooms[key] = { file, floor: hit.f.level, block: block ? "C1." + block : "", id: hit.r.id };
}
for (const f of fs.readdirSync(OUT)) if (f.endsWith(".png") && !files.has(f)) fs.unlinkSync(path.join(OUT, f));
manifest.version = hash.digest("hex").slice(0, 10);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`карты для бота: ${files.size} картинок, версия ${manifest.version}`);
