/* Тексты сообщений бота (parse_mode HTML) */
import * as T from "./sched.js";

export const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function place(it) {
  if (it.online) return "💻 онлайн";
  const room = `<code>${esc(T.roomShort(it.room) || "—")}</code>`;
  const b = T.bldg(it);
  if (b) return `📍 ${room} · ${esc(b.replace(/^корпус\s+/i, "Корпус "))}`;
  const fl = T.floorOf(it.room), bl = T.blockOf(it.room);
  return `📍 ${room}` + (fl ? ` · ${fl} этаж` : "") + (bl ? `, блок ${bl}` : "");
}
const meta = it => (T.TYPE[it.type] || "занятие") + (it.teacher ? ` · ${esc(it.teacher)}` : "");

function relDay(iso, now) {
  if (iso === now.iso) return "сегодня";
  if (iso === T.isoAdd(now.iso, 1)) return "завтра";
  return "";
}

/* ---------- день ---------- */
export function dayText(S, iso, now) {
  const k = T.keyOf(iso), rel = relDay(iso, now);
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
    if (i) {
      const gap = g.s - list[i - 1].e;
      if (gap >= 60) parts.push(`<i>☕ окно ${T.dur(gap)}</i>`);
    }
    let mark = "";
    if (iso === now.iso) mark = now.min >= g.re ? "✔️ " : now.min >= g.rs ? "🟢 " : "";
    parts.push(`${mark}<b>${T.hhmm(g.s)}–${T.hhmm(g.e)}</b>  ${esc(g.it.subject)}\n${place(g.it)} · ${meta(g.it)}`);
  });
  return `${head}\n\n${parts.join("\n\n")}`;
}

/* ---------- неделя ---------- */
export function weekText(S, ws, now) {
  const end = T.isoAdd(ws, 5);
  const lines = [`🗓 <b>Неделя ${T.fmtShort(ws)} – ${T.fmtShort(end)}</b>`];
  for (let i = 0; i < 6; i++) {
    const iso = T.isoAdd(ws, i), k = T.KEYS[i], st = T.dayState(S, iso);
    const today = iso === now.iso ? " · сегодня" : "";
    lines.push("");
    lines.push(`<b>${T.SHORT[k]}, ${T.fmtShort(iso)}</b>${today}`);
    if (st.kind !== "study") { lines.push(`   ${st.kind === "holiday" ? "🎉 " + esc(st.label) : st.label}`); continue; }
    const list = T.blocks(S, k);
    if (!list.length) { lines.push("   пар нет"); continue; }
    for (const g of list) {
      const room = g.it.online ? "💻" : `<code>${esc(T.roomShort(g.it.room))}</code>`;
      lines.push(`   ${T.hhmm(g.s)}–${T.hhmm(g.e)}  ${room}  ${esc(g.it.subject)}`);
    }
  }
  return lines.join("\n");
}

/* ---------- следующая пара ---------- */
export function nextText(S, now) {
  const n = T.nextClass(S, now);
  if (!n) return { text: "🏁 Пар больше нет — триместр позади", n: null };
  const it = n.g.it, k = T.keyOf(n.iso);
  const when = n.iso === now.iso ? "сегодня" : n.iso === T.isoAdd(now.iso, 1) ? "завтра" : T.WHEN[k];
  const head = n.live
    ? `🟢 <b>Сейчас идёт</b> · ещё ${T.dur(n.left)}`
    : `⏭ <b>Следующая пара</b> · через ${T.dur(n.wait)}`;
  return {
    n,
    text: `${head}\n\n<b>${esc(it.subject)}</b>\n` +
          `🕐 ${when}, ${T.hhmm(n.g.s)}–${T.hhmm(n.g.e)} · ${T.TYPE[it.type] || "занятие"}\n` +
          `${place(it)}` + (it.teacher ? `\n👤 ${esc(it.teacher)}` : ""),
  };
}

export function reminderText(g, lead) {
  const it = g.it;
  return `⏰ <b>Через ${lead} мин</b>\n\n<b>${esc(it.subject)}</b>\n` +
         `🕐 ${T.hhmm(g.s)}–${T.hhmm(g.e)} · ${T.TYPE[it.type] || "занятие"}\n${place(it)}` +
         (it.teacher ? `\n👤 ${esc(it.teacher)}` : "");
}

/* вечернее сообщение на завтра; null — отправлять нечего */
export function eveningText(S, now) {
  let iso = T.isoAdd(now.iso, 1), label = "Завтра";
  if (!T.keyOf(iso)) { iso = T.isoAdd(iso, 1); label = "В понедельник"; }
  const st = T.dayState(S, iso), cur = T.dayState(S, now.iso);
  if (st.kind === "holiday") return { iso, text: `🎉 ${label} праздник — ${esc(st.label)}. Пар нет, отдыхай` };
  if (st.kind === "exams" && cur.kind !== "exams") return { iso, text: `📝 ${label} начинается сессия. Удачи!` };
  if (st.kind === "vacation" && cur.kind !== "vacation") return { iso, text: `🏖 ${label} каникулы — пар больше нет` };
  if (st.kind !== "study") return null;
  if (!T.blocks(S, T.keyOf(iso)).length) return { iso, text: `😌 ${label} пар нет` };
  return { iso, text: `🌙 ${label}:\n\n` + dayText(S, iso, now) };
}

export const settingsText = (u, owner) =>
  `⚙️ <b>Настройки</b>\n\n` +
  `👤 Расписание: <b>${esc(owner)}</b>\n` +
  `⏰ Напоминание перед парой: <b>${u.lead_min ? "за " + u.lead_min + " мин" : "выкл"}</b>\n` +
  `☀️ Утром пары на день: <b>${u.morning >= 0 ? T.hhmm(u.morning) : "выкл"}</b>\n` +
  `🌙 Вечером пары на завтра: <b>${u.evening >= 0 ? T.hhmm(u.evening) : "выкл"}</b>\n\n` +
  `<i>Нажимай на кнопки — значения переключаются по кругу.</i>`;

export const who = u => esc([u.name, u.username ? "@" + u.username : ""].filter(Boolean).join(" ")) || String(u.chat_id);
