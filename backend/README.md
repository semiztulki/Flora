# Flora backend

FastAPI + WebSocket backend for the Flora messenger MVP: authorization-gated
contacts, block list, group chats, real-time messages with typing indicators,
and presence status (including invisible mode).

## Identity: UIN, not username

Classic-ICQ style — there's no username at all. Every account gets a
permanent, random 5-digit number (`User.uin`, 10000-99999) at registration;
it's the login credential and the only way to look someone up (contacts,
groups, reports, admin). It's never chosen and never changes.

"Pretty" numbers — repdigits (`11111`), round thousands (`10000`), 5-digit
runs (`12345`, `54321`), and palindromes (`12321`) — are excluded from
random assignment (`app/reserved_uins.py`, seeded into `reserved_uins` at
every startup, ~1% of the number space) specifically so they can't be
farmed by registering repeatedly. An admin can still hand one out
deliberately via `POST /admin/users/{user_id}/uin`.

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

There's no Alembic here — every startup (`init_db()` in `app/database.py`)
diffs each model's columns against the actual table and `ALTER TABLE ADD
COLUMN`s whatever's missing, so pulling in a schema change (a new column on
an existing table) just works on the next restart. It only ever adds
columns — existing data, and columns it doesn't recognize, are left alone.
Good enough for this project's SQLite dev DB; a real migration tool would
still be the right call before ever pointing this at Postgres in production.

## API

- `POST /auth/register` — `{display_name, password}` -> `{access_token, user}`
  (the `user.uin` in the response is the only time it's convenient to grab —
  it's also always visible on your own profile screen)
- `POST /auth/login` — `{uin, password}` -> `{access_token, user}`
- `GET /auth/me` — current user, used to restore a session from a stored token
- `PATCH /auth/me` — `{display_name?, bio?}` update your own profile
- `GET /contacts` — list authorized (accepted) contacts
- `POST /contacts` — `{uin}` send a contact request; if they already sent
  you one, both sides auto-accept instead of leaving two pending requests
- `DELETE /contacts/{contact_id}` — remove someone from *your* contact list
  only (one-directional — they keep you until they remove you too)
- `GET /contacts/requests` — incoming requests waiting for your authorization
- `POST /contacts/requests/{requester_id}/accept` / `.../decline`
- `POST /contacts/block` / `POST /contacts/unblock` — `{uin}`
- `GET /contacts/blocked` — your block list
- `GET /messages/{contact_id}?since_id=0` — 1-to-1 history; pass the highest
  cached message id for delta sync instead of refetching everything
- `GET /groups` — list groups the current user belongs to
- `POST /groups` — `{name, member_uins: [...]}` create a group
- `POST /groups/{group_id}/members` — `{uin}` add a member to a group
- `GET /groups/{group_id}/messages?since_id=0` — group history, same delta-sync param
- `POST /attachments` — multipart `file` upload (image only, capped at
  `max_attachment_bytes`) -> `{id, content_type, size_bytes, width, height}`
- `GET /attachments/{id}` — attachment metadata; `GET /attachments/{id}/file`
  — the actual bytes. Both require the caller to be the uploader or a
  participant in a message that references the attachment.
- `PATCH /contacts/{contact_id}/visibility` — `{visible_when_invisible: bool}`
  grants/revokes one contact's ability to see your real status while you're
  invisible, instead of "offline" like everyone else
- `GET /admin/users/{uin}` — user info + active ban, if any (admin only)
- `POST /admin/users/{user_id}/ban` — `{duration_minutes, reason}`
  (`duration_minutes: null` = permanent) — admin only, force-disconnects the
  user's active WS connections immediately
- `POST /admin/users/{user_id}/unban` — admin only, lifts a ban early
- `POST /admin/users/{user_id}/uin` — `{uin}` admin only, hands a user a
  specific number (409 if it's already someone else's) — the escape hatch
  for granting one of the reserved "pretty" numbers deliberately
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
receive messages instantly — but everyone else is told you're `offline`,
*unless* you've explicitly granted that specific contact
`visible_when_invisible` (per-contact, one-directional — them seeing your
true status doesn't grant you seeing theirs). This masking is applied both to
the live `presence` WS push and to the `status` field in `GET /contacts`, so
there's no way to catch the real status through a REST refresh either.
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
separate table — set `ADMIN_UINS` (comma-separated) in `.env` to your own
UIN after you register, and it's synced onto `User.is_admin` on every
authenticated request (so it takes effect on your next request, no
migration needed). Admins can look up any user and ban them for a chosen
duration or permanently, with a reason; the ban blocks login, every
authenticated REST call, and new WS connections (existing ones are dropped
immediately), and the client is told the reason and how long is left. An
admin can't ban another admin.

Users can also submit a report (`POST /reports`) against another user, either
standalone or attached to a specific DM/group message — the excerpt is
always read from the message row itself server-side, never taken from the
client. This is deliberately a separate action from blocking, not a
replacement for it: blocking is unconditional and needs no justification
(muting an unwanted contact, say), while a report puts something in front of
an admin. Admins list open reports (`GET /reports?resolved=false`) and
resolve them (`POST /reports/{id}/resolve`) once handled — typically by
looking up the reported user and banning them, but resolving and banning are
independent actions. This still intentionally does not include automated
content scanning — see the project README for why (short version: real
end-to-end encryption and proactive server-side moderation are mutually
exclusive, and this is a personal project without a trust & safety team, so
moderation here is reactive, human-in-the-loop by design).

## Offline delivery (store-and-forward)

Messages and group messages are always persisted immediately, regardless of
whether the recipient is online. If they're offline, delivery is deferred:
the moment they reconnect, the server replays everything they missed (in
order) before anything else happens on that connection — the same idea as
classic ICQ's "you have offline messages" behaviour. For 1-to-1 messages this
is tracked with a `delivered` flag per message; for group messages, since a
message can have many recipients, each membership tracks
`last_delivered_message_id` instead.

Two correctness properties worth being explicit about, since messenger
backends are notorious for getting them wrong under concurrency/flaky
connections:
- **Never cross-delivered.** `sender_id`/`recipient_id` are always derived
  from that specific WebSocket connection's own authenticated `user_id` and
  that connection's own received frame — never from any shared/global
  state — so two connections can't race and swap which message goes to
  whom. Python's async model (single-threaded, cooperative) plus this
  per-connection scoping makes it structurally impossible, not just unlikely.
- **`delivered` reflects a confirmed send, not presumed presence.**
  `ConnectionManager.send_to_user` returns whether the write actually
  succeeded (and drops any socket that turns out to be dead), and only that
  return value flips `delivered`/`last_delivered_message_id` — a connection
  that looks active but is actually a dead mobile socket the server hasn't
  noticed yet no longer causes a message to be marked delivered (and
  therefore never replayed) when it silently failed to send.
- **`client_id` retries can't create a duplicate.** The unique constraint on
  `(sender_id, client_id)` is the real guarantee — the pre-check `SELECT`
  is just an optimization to skip a redundant insert attempt; a genuine
  race (e.g. the same retry landing from two of the sender's own devices at
  once) is caught by the DB constraint and handled the same way as the
  pre-check.
