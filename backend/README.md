# Flora backend

FastAPI + WebSocket backend for the Flora messenger MVP: authorization-gated
contacts, block list, group chats, real-time messages with typing indicators,
and presence status (including invisible mode).

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
- `PATCH /auth/me` — `{display_name?, bio?}` update your own profile
- `GET /contacts` — list authorized (accepted) contacts
- `POST /contacts` — `{username}` send a contact request; if they already sent
  you one, both sides auto-accept instead of leaving two pending requests
- `GET /contacts/requests` — incoming requests waiting for your authorization
- `POST /contacts/requests/{requester_id}/accept` / `.../decline`
- `POST /contacts/block` / `POST /contacts/unblock` — `{username}`
- `GET /contacts/blocked` — your block list
- `GET /messages/{contact_id}?since_id=0` — 1-to-1 history; pass the highest
  cached message id for delta sync instead of refetching everything
- `GET /groups` — list groups the current user belongs to
- `POST /groups` — `{name, member_usernames: [...]}` create a group
- `POST /groups/{group_id}/members` — `{username}` add a member to a group
- `GET /groups/{group_id}/messages?since_id=0` — group history, same delta-sync param
- `POST /attachments` — multipart `file` upload (image only, capped at
  `max_attachment_bytes`) -> `{id, content_type, size_bytes, width, height}`
- `GET /attachments/{id}` — attachment metadata; `GET /attachments/{id}/file`
  — the actual bytes. Both require the caller to be the uploader or a
  participant in a message that references the attachment.
- `GET /admin/users/{username}` — user info + active ban, if any (admin only)
- `POST /admin/users/{user_id}/ban` — `{duration_minutes, reason}`
  (`duration_minutes: null` = permanent) — admin only, force-disconnects the
  user's active WS connections immediately
- `POST /admin/users/{user_id}/unban` — admin only, lifts a ban early
- `WS /ws?token=<access_token>&status=online` — real-time channel. `status`
  (optional, defaults to `online`) sets your presence for this connection —
  pass `invisible` or `dnd` to avoid a flash of "online" before you can
  update it. JSON frames:
  - send `{"type": "message", "recipient_id": 2, "body": "hi", "attachment_id": 5, "client_id": "<uuid>"}` (`body` may be empty when `attachment_id` is set)
  - send `{"type": "group_message", "group_id": 1, "body": "hi", "attachment_id": 5, "client_id": "<uuid>"}`
  - send `{"type": "presence", "status": "online" | "away" | "dnd" | "invisible"}`
  - send `{"type": "typing", "recipient_id": 2}` or `{"type": "typing", "group_id": 1}` — ephemeral, not persisted
  - send `{"type": "ping"}` -> receive `{"type": "pong"}` (heartbeat)
  - receive `{"type": "message" | "group_message" | "presence" | "typing", ...}`

`client_id` is a client-generated UUID used to dedupe retried sends (e.g. after
a dropped connection) — resending the same `client_id` just re-confirms the
already-stored message instead of creating a duplicate.

Presence goes `online` (or whatever `status` was requested) on first active WS
connection, `offline` on last disconnect, and updates are pushed to anyone who
has that user as a contact. **Invisible** means actually connected — you still
receive messages instantly — but everyone else is told you're `offline`.
Blocking someone severs any contact relationship in both directions and
silently rejects direct messages between the two of you.

## Photo attachments

Images only (jpeg/png/gif/webp — content type is sniffed from the actual
bytes with Pillow, never trusted from the client), capped at
`max_attachment_bytes` (8 MB by default), stored on local disk under
`upload_dir`. There's no P2P or direct-transfer path for larger files yet —
that's planned as a live relay through the existing WebSocket (both sides
online, nothing persisted), not real device-to-device P2P, since mobile P2P
needs `react-native-webrtc` (which breaks the plain Expo Go workflow) and
usually a TURN relay anyway.

Attachments are deleted automatically after `attachment_retention_days` (30
by default) — a background task in `app/cleanup.py` runs every 6 hours,
removing the file and DB row and replacing the body of any message that
referenced it with a placeholder. This keeps storage bounded without needing
external object storage for the MVP; swapping in S3/R2 later just means
replacing the local-disk read/write in `app/routers/attachments.py`.

## Moderation

There's one role: admin. Membership is config-driven, not stored as a
separate table — set `ADMIN_USERNAMES` (comma-separated) in `.env` to your
own username after you register, and it's synced onto `User.is_admin` on
every authenticated request (so it takes effect on your next request, no
migration needed). Admins can look up any user and ban them for a chosen
duration or permanently, with a reason; the ban blocks login, every
authenticated REST call, and new WS connections (existing ones are dropped
immediately), and the client is told the reason and how long is left. An
admin can't ban another admin. This intentionally does not include content
scanning or a user-facing "report" flow yet — see the project README for
why (short version: real end-to-end encryption and proactive server-side
moderation are mutually exclusive, and this is a personal project without a
trust & safety team, so moderation here is reactive by design).

## Offline delivery (store-and-forward)

Messages and group messages are always persisted immediately, regardless of
whether the recipient is online. If they're offline, delivery is deferred:
the moment they reconnect, the server replays everything they missed (in
order) before anything else happens on that connection — the same idea as
classic ICQ's "you have offline messages" behaviour. For 1-to-1 messages this
is tracked with a `delivered` flag per message; for group messages, since a
message can have many recipients, each membership tracks
`last_delivered_message_id` instead.
