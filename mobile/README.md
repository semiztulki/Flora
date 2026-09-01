# Flora mobile

Expo (React Native + TypeScript) client for the Flora messenger MVP.

## Setup

```bash
cd mobile
npm install
```

## Run

```bash
npm start
```

Then open in Expo Go (scan the QR code) or press `a` / `i` for an
Android/iOS simulator.

## Backend URL

The API/WebSocket base URLs come from `app.json` -> `expo.extra.apiUrl` /
`wsUrl` (read via `src/config.ts`). They default to `localhost:8000`, which
works for the iOS simulator; for a physical device or Android emulator, set
them to your machine's LAN IP, e.g. `http://192.168.1.20:8000`.

## Offline-first chat

Chat history is read from a local SQLite database (`src/db`), not fetched
live on every screen open — messages, sender/timestamps and read state all
live on the device, so a chat opens instantly even with no signal. On
connect, the client only asks the server for messages newer than what it has
cached (`since_id` delta sync) and merges them in. Sending is optimistic: a
message is written locally as `pending` and shown immediately, then sent over
the WebSocket; if the socket is down, it just stays `pending` and gets
flushed automatically once `SocketContext` reconnects (exponential backoff +
a ping/pong heartbeat to detect connections that die silently on a weak
signal).

## Notification sounds

Two, both wired through `src/utils/sound.ts` (expo-av) and triggered from
`SocketContext` regardless of which screen is open, and both skipped while
you're set to "не беспокоить":
- `assets/sounds/incoming.mp3` — a DM or group message arrives (not your own echo)
- `assets/sounds/contact_request.mp3` — someone sends you a contact request
  (the backend pushes a `contact_request` WS event when the pending row is
  created; `ContactsScreen` also uses it to refresh the requests list live
  instead of waiting for the next focus)

Both are foreground-only — there's no background push infrastructure behind
this yet, so neither plays with the app closed or backgrounded. To swap a
sound, replace the file (keep the same name) or edit the path in
`src/utils/sound.ts`.

## Photo attachments

Tap 📎 in a chat to send a photo. Anything over `MAX_ATTACHMENT_BYTES`
(`src/config.ts`, kept in sync with the backend's 8 MB default) gets a
warning instead of an upload — sending larger files directly between two
online devices is planned but not built yet. Received images are downloaded
once via `src/utils/attachmentCache.ts` (an authenticated `expo-file-system`
download) and cached under the app's document directory, so — like the rest
of the chat history — they're viewable offline after the first load without
re-fetching.

## Search

🔍 in the Contacts header opens a global search over the local message log —
DMs and group chats together, most recent first. It filters in JS
(`src/db/search.ts`) rather than SQL `LIKE`, since SQLite's `LIKE` only
case-folds ASCII and a Russian-language app needs "привет" to match
"Привет". Search only ever looks at what's already synced to the device, so
it works offline too.

## Moderation (bans + reports)

If your account is an admin (`ADMIN_USERNAMES` on the backend), a 🛡️ shows
up in the Contacts header opening `AdminScreen` — an open-reports queue up
top (jump straight into looking up the reported user, or resolve without
acting), then a lookup box to ban any user for a preset duration or
permanently with a reason, or lift an existing ban early. A banned user is
shown a dedicated screen with the reason and a live countdown
(`src/utils/formatRemaining.ts`), reached two ways: a blocked login attempt
(`AuthContext.login` catches the structured 403 and sets `banInfo` instead
of surfacing a generic error), or a live `"banned"` WS frame if they're
banned while already connected (`SocketContext` hands it to
`AuthContext.reportBanned`, which also signs them out).

Anyone (not just admins) can report a user via `ReportScreen` — long-press a
contact row (shows "Пожаловаться" and "Заблокировать" as two separate
options, deliberately: block needs no justification, report is for
something an admin should look at) or long-press someone else's message
bubble in a DM or group chat to report that specific message.

## Search

🔍 in the Contacts header opens a global search over the local message log —
DMs and group chats together, most recent first. It filters in JS
(`src/db/search.ts`) rather than SQL `LIKE`, since SQLite's `LIKE` only
case-folds ASCII and a Russian-language app needs "привет" to match
"Привет". Search only ever looks at what's already synced to the device, so
it works offline too.

## Structure

- `src/api` — REST client (axios) + secure token storage
- `src/db` — local SQLite message/group-message log, read state, and search (offline-first source of truth for chat UI)
- `src/components` — `AttachmentImage` (cached image bubble), `ImageViewerModal` (fullscreen tap-to-view)
- `src/context/AuthContext` — login/register/logout, session restore, profile updates, ban state
- `src/context/SocketContext` — WebSocket connection with reconnect/heartbeat, message/group-message/presence/typing/ban events, outbox flush, notification sound
- `src/screens` — Login, Register, Contacts (contacts + groups + requests + blocked, unread badges, status picker), Chat, GroupChat, CreateGroup, Profile, Search, Admin, Banned, Report
- `src/navigation` — auth-gated stack navigator
