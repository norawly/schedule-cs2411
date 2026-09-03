#!/usr/bin/env node
/* Локальный сервер редактора карты.
   Запуск:  node tools/editor-server.js     →  http://localhost:8790
   Сохранение из редактора пишет public/map/floors.json (со снимком в public/map/backups). */
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EDITOR = path.join(ROOT, "editor");
const DATA = path.join(ROOT, "public", "map", "floors.json");
const BACKUPS = path.join(ROOT, "public", "map", "backups");
const PORT = process.env.PORT || 8790;

const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};

function send(res, code, body, type){
  res.writeHead(code, {"Content-Type": type || "text/plain; charset=utf-8",
                       "Cache-Control": "no-store"});
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);

  if (req.method === "POST" && p === "/api/save") {
    let raw = "";
    req.on("data", c => { raw += c; if (raw.length > 20e6) req.destroy(); });
    req.on("end", () => {
      try {
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.floors)) throw new Error("нет floors[]");
        fs.mkdirSync(BACKUPS, { recursive: true });
        if (fs.existsSync(DATA)) {
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          fs.copyFileSync(DATA, path.join(BACKUPS, `floors-${ts}.json`));
        }
        fs.writeFileSync(DATA, JSON.stringify(data));
        const rooms = data.floors.reduce((n, f) => n + (f.rooms || []).length, 0);
        console.log(`сохранено: ${rooms} кабинетов → public/map/floors.json`);
        send(res, 200, JSON.stringify({ ok: true, rooms }), MIME[".json"]);
      } catch (e) {
        send(res, 400, JSON.stringify({ ok: false, error: String(e.message) }), MIME[".json"]);
      }
    });
    return;
  }

  if (req.method === "POST" && p === "/api/shot") {          // отладочный снимок 3D
    let raw = "";
    req.on("data", c => { raw += c; if (raw.length > 40e6) req.destroy(); });
    req.on("end", () => {
      const b64 = raw.replace(/^data:image\/png;base64,/, "");
      const out = path.join(ROOT, "public", "map", "_shot.png");
      fs.writeFileSync(out, Buffer.from(b64, "base64"));
      send(res, 200, JSON.stringify({ ok: true }), MIME[".json"]);
    });
    return;
  }

  if (p === "/schedule.js") {
    const f = path.join(ROOT, "public", "schedule.js");
    return send(res, 200, fs.readFileSync(f), MIME[".js"]);
  }

  if (p === "/map/floors.json") {
    if (!fs.existsSync(DATA)) return send(res, 404, "нет floors.json");
    return send(res, 200, fs.readFileSync(DATA), MIME[".json"]);
  }

  if (p === "/") p = "/index.html";
  const file = path.join(EDITOR, p);
  if (!file.startsWith(EDITOR) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    return send(res, 404, "404");
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
}).listen(PORT, () => {
  console.log(`Редактор карты:  http://localhost:${PORT}`);
  console.log(`Данные:          ${path.relative(ROOT, DATA)}`);
});
