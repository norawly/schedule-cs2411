#!/usr/bin/env bash
# Кладёт токен Telegram-бота в секреты Cloudflare (воркер schedule).
# Токен вводится в скрытое поле: в код, историю команд и GitHub он не попадает.
# Тот же скрипт — для смены токена потом.
set -euo pipefail
cd "$(dirname "$0")/.."

secret_names() {
  npx --yes wrangler secret list 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const a = s.indexOf("["), b = s.lastIndexOf("]");
      try { for (const x of JSON.parse(s.slice(a, b + 1))) console.log(x.name); } catch {}
    });'
}

echo "Проверяю секреты воркера schedule…"
wrong=0
while IFS= read -r name; do
  [ -z "$name" ] || [ "$name" = "TELEGRAM_TOKEN" ] && continue
  wrong=$((wrong + 1))
  echo "Нашёл секрет с неправильным именем — удаляю (wrangler спросит подтверждение, нажми y)."
  npx --yes wrangler secret delete "$name" >/dev/null
done < <(secret_names)
[ "$wrong" -eq 0 ] && echo "Лишних секретов нет."

echo
echo "Сейчас wrangler спросит «Enter a secret value» — вставь токен из @BotFather и нажми Enter."
echo "Ничего не дописывай в саму команду."
npx --yes wrangler secret put TELEGRAM_TOKEN

echo
echo "Готово. Подожди минуту — бот сам настроит webhook. Потом напиши ему /start."
