-- Язык, календарь Moodle и учёт сообщений, чтобы чат не засорялся

ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'ru';
ALTER TABLE users ADD COLUMN cal_url TEXT;          -- личная ссылка на календарь Moodle
ALTER TABLE users ADD COLUMN cal_hash TEXT;         -- отпечаток последней загрузки
ALTER TABLE users ADD COLUMN cal_checked INTEGER;   -- когда проверяли последний раз

-- сообщения бота в чате: держим только последние два
CREATE TABLE IF NOT EXISTS msgs (
  chat_id    INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  kind       TEXT    NOT NULL,          -- class | info | deadline
  at         INTEGER NOT NULL,
  ref        TEXT,                      -- для карточки пары: дата и начало
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS msgs_chat ON msgs(chat_id, at);

-- дедлайны из календаря Moodle
CREATE TABLE IF NOT EXISTS deadlines (
  chat_id  INTEGER NOT NULL,
  uid      TEXT    NOT NULL,
  title    TEXT,
  subject  TEXT,
  due      INTEGER NOT NULL,            -- unix-время, мс
  descr    TEXT,
  modified TEXT,
  PRIMARY KEY (chat_id, uid)
);
CREATE INDEX IF NOT EXISTS deadlines_due ON deadlines(chat_id, due);

-- неизвестные: кулдаун за перебор баркодов
CREATE TABLE IF NOT EXISTS guests (
  chat_id INTEGER PRIMARY KEY,
  fails   INTEGER NOT NULL DEFAULT 0,
  until   INTEGER
);
