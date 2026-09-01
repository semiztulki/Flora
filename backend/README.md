# Flora backend

FastAPI + WebSocket backend for the Flora messenger MVP: registration/login,
contacts, real-time 1-to-1 messages, and presence status.

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # edit JWT_SECRET before deploying anywhere real
```

## Run

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Defaults to a local SQLite file (`flora.db`). Set `DATABASE_URL` in `.env` to
point at Postgres for anything beyond local dev, e.g.:

```
DATABASE_URL=postgresql+asyncpg://user:password@localhost/flora
```

## API

- `POST /auth/register` — `{username, display_name, password}` -> `{access_token, user}`
- `POST /auth/login` — `{username, password}` -> `{access_token, user}`
- `GET /contacts` — list contacts (requires `Authorization: Bearer <token>`)
- `POST /contacts` — `{username}` add a contact (mutual)
- `GET /messages/{contact_id}` — message history with a contact
- `WS /ws?token=<access_token>` — real-time channel, JSON frames:
  - send `{"type": "message", "recipient_id": 2, "body": "hi"}`
  - send `{"type": "presence", "status": "online" | "away"}`
  - receive `{"type": "message", ...}` / `{"type": "presence", ...}`

Presence goes `online` on first active WS connection, `offline` on last
disconnect, and updates are pushed to anyone who has that user as a contact.
