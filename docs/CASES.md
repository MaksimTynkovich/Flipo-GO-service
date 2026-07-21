# Кейсы (lootbox)

## Модель

- В loot table кейса можно указать **любую** коллекцию Telegram-подарков — склад бота не обязателен.
- Открытие всегда создаёт запись в инвентаре Flipo (`telegram_tx_ref = case:{open_id}`).
- Если у бота есть экземпляр коллекции — он привязывается сразу (`backed`).
- Иначе приз `unbacked`: пользователь может продать (buyback) сразу; вывод ставит `withdraw_pending` с текстом «Ожидайте, бот закупает подарок».
- **Бесплатные кейсы** (`price_nanoton = 0`, не daily): обязательно `require_channel`; открытие только при подписке на `PROMO_REQUIRED_CHANNEL` (тот же канал, что у колеса/стейкинга).

## Закупка и выдача вручную

1. Админка → Финансы → очередь вывода подарков.
2. Строки с **«Нужна закупка»**: купите collectible на аккаунт депозита (MRKT / Portals / Fragment UI).
3. Дождитесь появления подарка на MTProto-аккаунте (`giftdeposit` / sync).
4. В очереди укажите `telegram_gift_id` (slug вида `plushpepe-1984`) → **Fulfill**.
5. Бот отправит подарок пользователю; статус → `withdrawn`.

Reject возвращает приз в инвентарь (`available`) без отправки.

## API (кратко)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/v1/cases` | Каталог |
| GET | `/api/v1/cases/:id` | Детали + loot |
| POST | `/api/v1/cases/:id/open` | Открыть (`idempotency_key`) |
| POST | `/api/v1/admin/withdrawals/gifts/:id/fulfill` | Привязать slug и отправить |
| GET | `/api/v1/admin/cases` | Список кейсов + loot (weight, active, RTP) |
| PUT | `/api/v1/admin/cases` | Создать/обновить кейс |
| PUT | `/api/v1/admin/cases/:id/loot` | Заменить loot table |

Админка: `/admin/cases` — CRUD кейса и таблицы лута (веса → шансы).


## Seed

При миграции создаются Premium, Daily и каталог (Starter … Legendary) с макета. Цены и веса правятся через админ API.
