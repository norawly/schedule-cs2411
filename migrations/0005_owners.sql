-- Личные расписания закреплены за аккаунтом: чужой в них не войдёт.
CREATE TABLE IF NOT EXISTS owners (
  person  TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  since   INTEGER NOT NULL
);
-- закрепляем за теми, кто уже привязан
INSERT OR IGNORE INTO owners (person, chat_id, since)
  SELECT person, chat_id, COALESCE(created_at, 0) FROM users
  WHERE person IN ('nurali', 'nurbek') AND status IN ('admin', 'approved');
