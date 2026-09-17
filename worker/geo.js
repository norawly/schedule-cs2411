/* Где человек: в университете или нет. Точка приходит из Telegram (разовая или live-трансляция). */

/* AITU, Mangilik El 55/11 (EXPO, корпус C1). Можно переопределить своей точкой из бота. */
export const CAMPUS = { lat: 51.0906, lon: 71.4166, radius: 700 };
const FRESH = 30 * 60000;              // разовая точка считается актуальной полчаса

export function distance(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const campusOf = u => (u.campus_lat != null && u.campus_lon != null)
  ? { lat: u.campus_lat, lon: u.campus_lon, radius: 400 } : CAMPUS;

/* "campus" | "away" | null (неизвестно или устарело) */
export function placeOf(u, ms = Date.now()) {
  if (u.lat == null || u.lon == null || !u.loc_at) return null;
  const live = u.loc_until && u.loc_until > ms;
  if (!live && ms - u.loc_at > FRESH) return null;
  const c = campusOf(u);
  return distance({ lat: u.lat, lon: u.lon }, c) <= c.radius ? "campus" : "away";
}

/* за сколько минут напоминать прямо сейчас */
export function leadFor(u, ms = Date.now()) {
  if (!u.geo) return u.lead_min || 0;
  if (!(u.lead_min > 0)) return 0;                 // напоминания выключены совсем
  const place = placeOf(u, ms);
  if (place === "campus") return u.lead_campus || 5;
  if (place === "away") return u.lead_home || 60;
  return u.lead_min;
}
