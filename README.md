# Flora

Альтернатива ICQ: мессенджер с личными сообщениями в реальном времени и
статусами присутствия (online/away/offline).

MVP включает:
- Регистрацию и вход, профиль ("о себе")
- Контакты с авторизацией заявок (как в классической ICQ — не автодобавление)
  и чёрным списком
- Личные и групповые чаты в реальном времени через WebSocket, с индикатором
  "печатает…"
- Статусы присутствия: online / away / не беспокоить / invisible (незаметно
  для остальных, при этом реально в сети)
- Офлайн-устойчивость в духе классической ICQ: локальный лог сообщений на
  устройстве, доставка "накопившихся" сообщений при подключении, реконнект
  с backoff

## Структура репозитория

- [`backend/`](backend/README.md) — FastAPI + WebSocket API (Python)
- [`mobile/`](mobile/README.md) — клиент на React Native (Expo) + TypeScript

## Быстрый старт

```bash
# Бэкенд
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload

# Мобильный клиент (в другом терминале)
cd mobile
npm install
npm start
```

Подробности — в README каждого каталога.
