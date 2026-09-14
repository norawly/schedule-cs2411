-- Бот теперь только напоминает о парах (за 20 минут), расписание на день не присылает
UPDATE users SET lead_min = 20 WHERE lead_min = 15;
UPDATE users SET morning = -1, evening = -1;
