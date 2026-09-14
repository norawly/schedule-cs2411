-- Пользователи бота
CREATE TABLE IF NOT EXISTS users (
  chat_id     INTEGER PRIMARY KEY,
  name        TEXT,
  username    TEXT,
  person      TEXT,                                -- чьё расписание: nurali, nurbek…
  status      TEXT    NOT NULL DEFAULT 'pending',  -- admin | approved | pending | banned
  lead_min    INTEGER NOT NULL DEFAULT 15,         -- напоминание за N минут, 0 — выкл
  morning     INTEGER NOT NULL DEFAULT 480,        -- утренняя сводка, минуты от полуночи, -1 — выкл
  evening     INTEGER NOT NULL DEFAULT 1260,       -- вечером на завтра, -1 — выкл
  created_at  INTEGER NOT NULL,
  notified_at INTEGER                              -- когда последний раз отвечали ожидающему
);
CREATE INDEX IF NOT EXISTS users_status ON users(status);

-- Что уже отправлено — чтобы напоминания не дублировались
CREATE TABLE IF NOT EXISTS sent (
  chat_id INTEGER NOT NULL,
  key     TEXT    NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (chat_id, key)
);

-- Служебное: состояние webhook и т.п.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
