/* Тексты сообщений бота (parse_mode HTML) */
import * as T from "./sched.js";

export const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function place(it) {
  if (it.online) return "💻 онлайн";
  const room = `<code>${esc(T.roomShort(it.room) || "—")}</code>`;
  const b = T.bldg(it);
  if (b) return `📍 ${room} · ${esc(b)}`;
  const fl = T.floorOf(it.room), bl = T.blockOf(it.room);
  return `📍 ${room}` + (fl ? ` · ${fl} этаж` : "") + (bl ? `, блок ${bl}` : "");
}

/* строка «где» для карточки; info — из /map/rooms/index.json */
export function roomLine(it, info) {
  if (it.online) return "💻 Онлайн";
  const room = `<b>${esc(T.roomShort(it.room) || "—")}</b>`;
  const b = T.bldg(it);
  if (b) return `🚪 Кабинет ${room} — ${esc(b)}`;
  const floor = info ? info.floor : T.floorOf(it.room);
  const block = info ? info.block : T.blockOf(it.room);
  return `🚪 Кабинет ${room}` + (floor ? ` — ${floor} этаж` : "") + (block ? `, блок ${block}` : "");
}

/* карточка пары: заголовок, предмет, начало, кабинет. Без преподавателя — только нужное перед парой. */
export function classCard(head, g, info, when = "") {
  const it = g.it;
  const start = when ? `🕐 ${cap(when)} в <b>${T.hhmm(g.rs)}</b>` : `🕐 Начало в <b>${T.hhmm(g.rs)}</b>`;
  return `${head}\n\n📘 <b>${esc(it.subject)}</b> · ${T.TYPE[it.type] || "занятие"}\n${start}\n${roomLine(it, info)}`;
}

/* ---------- день и неделя (команды /today, /week) ---------- */
export function dayText(S, iso, now) {
  const k = T.keyOf(iso);
  const rel = iso === now.iso ? "сегодня" : iso === T.isoAdd(now.iso, 1) ? "завтра" : "";
  const head = `<b>${k ? T.FULL[k] : "Воскресенье"}, ${T.fmtDate(iso)}</b>` + (rel ? ` · ${rel}` : "");
  if (!k) return `${head}\n\n😴 Выходной`;
  const st = T.dayState(S, iso);
  if (st.kind === "holiday") return `${head}\n\n🎉 Праздник — ${esc(st.label)}. Пар нет`;
  if (st.kind === "exams") return `${head}\n\n📝 Сессия — обычных пар нет`;
  if (st.kind === "vacation") return `${head}\n\n🏖 Каникулы`;
  if (st.kind !== "study") return `${head}\n\n— ${st.label}`;
  const list = T.blocks(S, k);
  if (!list.length) return `${head}\n\n😌 Пар нет`;
  const parts = [];
  list.forEach((g, i) => {
    if (i) { const gap = g.s - list[i - 1].e; if (gap >= 60) parts.push(`<i>☕ окно ${T.dur(gap)}</i>`); }
    let mark = "";
    if (iso === now.iso) mark = now.min >= g.re ? "✔️ " : now.min >= g.rs ? "🟢 " : "";
    parts.push(`${mark}<b>${T.hhmm(g.s)}–${T.hhmm(g.e)}</b>  ${esc(g.it.subject)}\n${place(g.it)}`);
  });
  return `${head}\n\n${parts.join("\n\n")}`;
}

export function weekText(S, ws, now) {
  const lines = [`🗓 <b>Неделя ${T.fmtShort(ws)} – ${T.fmtShort(T.isoAdd(ws, 5))}</b>`];
  for (let i = 0; i < 6; i++) {
    const iso = T.isoAdd(ws, i), k = T.KEYS[i], st = T.dayState(S, iso);
    lines.push("", `<b>${T.SHORT[k]}, ${T.fmtShort(iso)}</b>${iso === now.iso ? " · сегодня" : ""}`);
    if (st.kind !== "study") { lines.push(`   ${st.kind === "holiday" ? "🎉 " + esc(st.label) : st.label}`); continue; }
    const list = T.blocks(S, k);
    if (!list.length) { lines.push("   пар нет"); continue; }
    for (const g of list)
      lines.push(`   ${T.hhmm(g.s)}–${T.hhmm(g.e)}  ${g.it.online ? "💻" : `<code>${esc(T.roomShort(g.it.room))}</code>`}  ${esc(g.it.subject)}`);
  }
  return lines.join("\n");
}

export const settingsText = (u, owner) =>
  `⚙️ <b>Настройки</b>\n\n` +
  `👤 Расписание: <b>${esc(owner)}</b>\n` +
  `🔔 Напоминание: <b>${u.lead_min ? "за " + u.lead_min + " мин до пары" : "выключено"}</b>\n\n` +
  `<i>Нажимай на кнопку — время переключается по кругу.</i>`;

export const who = u => esc([u.name, u.username ? "@" + u.username : ""].filter(Boolean).join(" ")) || String(u.chat_id);
