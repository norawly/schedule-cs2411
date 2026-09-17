-- Геолокация: дома напоминаем раньше, в университете — позже.
-- Храним только последнюю точку, без истории.
ALTER TABLE users ADD COLUMN geo INTEGER NOT NULL DEFAULT 0;         -- 1 — подстраивать время по месту
ALTER TABLE users ADD COLUMN lead_home INTEGER NOT NULL DEFAULT 60;  -- не в университете
ALTER TABLE users ADD COLUMN lead_campus INTEGER NOT NULL DEFAULT 5; -- в университете
ALTER TABLE users ADD COLUMN lat REAL;
ALTER TABLE users ADD COLUMN lon REAL;
ALTER TABLE users ADD COLUMN loc_at INTEGER;                          -- когда пришла точка
ALTER TABLE users ADD COLUMN loc_until INTEGER;                       -- до когда транслируется live-геопозиция
ALTER TABLE users ADD COLUMN campus_lat REAL;                         -- своя точка «университет», если задана
ALTER TABLE users ADD COLUMN campus_lon REAL;
