# Flora backend

FastAPI + WebSocket backend for the Flora messenger MVP: registration/login,
contacts, group chats, real-time messages, and presence status.

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
- `GET /auth/me` — current user, used to restore a session from a stored token
- `GET /contacts` — list contacts (requires `Authorization: Bearer <token>`)
- `POST /contacts` — `{username}` add a contact (mutual)
- `GET /messages/{contact_id}?since_id=0` — 1-to-1 history; pass the highest
  cached message id for delta sync instead of refetching everything
- `GET /groups` — list groups the current user belongs to
- `POST /groups` — `{name, member_usernames: [...]}` create a group
- `POST /groups/{group_id}/members` — `{username}` add a member to a group
- `GET /groups/{group_id}/messages?since_id=0` — group history, same delta-sync param
- `WS /ws?token=<access_token>` — real-time channel, JSON frames:
  - send `{"type": "message", "recipient_id": 2, "body": "hi", "client_id": "<uuid>"}`
  - send `{"type": "group_message", "group_id": 1, "body": "hi", "client_id": "<uuid>"}`
  - send `{"type": "presence", "status": "online" | "away"}`
  - send `{"type": "ping"}` -> receive `{"type": "pong"}` (heartbeat)
  - receive `{"type": "message", ...}` / `{"type": "group_message", ...}` / `{"type": "presence", ...}`

`client_id` is a client-generated UUID used to dedupe retried sends (e.g. after
a dropped connection) — resending the same `client_id` just re-confirms the
already-stored message instead of creating a duplicate.

Presence goes `online` on first active WS connection, `offline` on last
disconnect, and updates are pushed to anyone who has that user as a contact.

## Offline delivery (store-and-forward)

Messages and group messages are always persisted immediately, regardless of
whether the recipient is online. If they're offline, delivery is deferred:
the moment they reconnect, the server replays everything they missed (in
order) before anything else happens on that connection — the same idea as
classic ICQ's "you have offline messages" behaviour. For 1-to-1 messages this
is tracked with a `delivered` flag per message; for group messages, since a
message can have many recipients, each membership tracks
`last_delivered_message_id` instead.
