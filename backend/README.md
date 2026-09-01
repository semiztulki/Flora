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

## Profile: an address card, not a social profile

Past the UIN and nickname (`display_name`), every other profile field is
optional and deliberately scoped to "facts a paper contact card would
carry": first/last name, pronouns, birthday (year optionally hidden), city,
country, a comma-separated `languages` list (rendered as chips client-side),
occupation, `interests`, a ~500-char `about`, one `website` link, and a
single `avatar` (no galleries/stories). `email`/`phone` are private by
default — each has its own `*_public` flag to opt into showing on the
profile someone else sees (`GET /profiles/{uin}`). Deliberately absent:
follower counts, registration date, mutual friends, activity stats, badges —
anything that turns an address card into a social platform.

`PATCH /auth/me` is patch-style over all of these
(`ProfileUpdate`/`_CLEARABLE_STRING_FIELDS` in `app/routers/auth.py`): a
field that's **omitted** (or sent `null`) is left untouched; a string field
sent as `""` is explicitly cleared to `NULL`. This lets a client clear one
field without having to resend the whole profile. `PATCH /auth/me/avatar`
— `{attachment_id}` (upload via `POST /attachments` first) — sets or clears
(`null`) the avatar; anyone signed in can view someone else's avatar file
regardless of DM/group history, since it's shown on contact lists and
profile cards, not just in a specific conversation.

Each contact also gets a **private local nickname**
(`PATCH /contacts/{contact_id}/nickname` — `{local_nickname}`) — "Лена —
реставратор" — visible only to the owner, never to the contact themselves
or anyone else; it lives on the `Contact` row (not on-device), so it
survives a reinstall.

`GET /profiles/{uin}` returns someone else's profile the way you're
allowed to see it: `status`/`status_note` already masked by their
invisible-mode rules (see Presence below), `email`/`phone` only present if
they opted in, `local_nickname` is *your own* label for them, and
`is_contact` says whether you already have them.

## API

- `POST /auth/register` — `{display_name, password}` -> `{access_token, user}`
  (the `user.uin` in the response is the only time it's convenient to grab —
  it's also always visible on your own profile screen)
- `POST /auth/login` — `{uin, password}` -> `{access_token, user}`
- `GET /auth/me` — current user, used to restore a session from a stored token
- `PATCH /auth/me` — patch-style profile update, see "Profile" above
- `PATCH /auth/me/avatar` — `{attachment_id: int | null}` set/clear your avatar
- `GET /profiles/{uin}` — someone else's profile, masked per their privacy/invisible settings
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
- `PATCH /contacts/{contact_id}/nickname` — `{local_nickname: str | null}` your
  own private label for this contact, see "Profile" above
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
- `WS /ws?token=<access_token>&status=available&invisible=false` — real-time
  channel. `status`/`invisible` (both optional, default `available`/`false`)
  set your presence for this connection's first activation — passed as query
  params rather than always connecting as visible-available-then-flipping,
  so reconnecting while dnd/invisible doesn't flash the wrong thing to
  watchers for the split second before the client can update it. JSON frames:
  - send `{"type": "message", "recipient_id": 2, "body": "hi", "attachment_id": 5, "client_id": "<uuid>"}` (`body` may be empty when `attachment_id` is set)
  - send `{"type": "group_message", "group_id": 1, "body": "hi", "attachment_id": 5, "client_id": "<uuid>"}`
  - send `{"type": "presence", ...}` — every field below is independent and
    optional; only the keys present in the frame get changed, so a client can
    e.g. toggle just `invisible` without resending the current mood:
    - `status`: one of `available | free_for_chat | away | not_available | occupied | dnd`
    - `invisible`: bool
    - `note`: short ephemeral text (max 120 chars) attached to the *current*
      status ("за кофе, минут на десять") — distinct from the permanent
      `about` profile field; send `""` to clear it
    - `duration_minutes`: int, optional self-expiry ("for: 1 hour") — a
      background sweep (`run_status_expiry_loop` in `app/routers/ws.py`,
      checks every 60s) reverts to `available` with `note`/expiry cleared
      once it passes; omit or send `0`/`null` for no expiry
  - send `{"type": "typing", "recipient_id": 2}` or `{"type": "typing", "group_id": 1}` — ephemeral, not persisted
  - send `{"type": "ping"}` -> receive `{"type": "pong"}` (heartbeat)
  - receive `{"type": "message" | "group_message" | "presence" | "typing", ...}`
    — a `"presence"` frame carries `{user_id, status, note, last_seen}`

`client_id` is a client-generated UUID used to dedupe retried sends (e.g. after
a dropped connection) — resending the same `client_id` just re-confirms the
already-stored message instead of creating a duplicate.

## Presence: classic-ICQ semantics, not a modern online/away/busy set

`status` is one of six user-settable "moods" (`PresenceStatus` in
`app/models.py`) — deliberately more granular than a generic tri-state:
`available`, `free_for_chat`, `away`, `not_available` (gone — "меня
фактически нет"), `occupied` (here but busy — "занят, но важное можно
написать"; distinct meaning from `not_available`), `dnd`. **`offline` is
never something a user picks** — it's what gets broadcast when there's no
live WS connection at all, exactly like before.

**Invisible is not a seventh mood — it's a separate `User.invisible`
boolean layered on top of whichever mood is active.** You still receive
messages instantly while invisible; everyone else is just told you're
`offline`, *unless* you've explicitly granted that specific contact
`visible_when_invisible` (per-contact, one-directional — them seeing your
true status doesn't grant you seeing theirs). This masking is applied both
to the live `presence` WS push and to the `status`/`status_note` fields in
`GET /contacts` and `GET /profiles/{uin}`, so there's no way to catch the
real status through a REST refresh either.

`status_note` ("Add a note", not "status message") is a short (≤120 char)
note attached to the *current* status — "до 16:00 на созвонах" — cleared or
replaced on the next status change, and masked the same way as `status`
when invisible. It's deliberately separate from the permanent `about`
profile field: one is who you are, the other is what you're doing right
now. An optional `duration_minutes` self-expires a status back to
`available` (note/expiry cleared) via a periodic sweep, since people
reliably forget to switch back by hand — especially on mobile.

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
