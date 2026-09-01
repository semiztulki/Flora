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

## Notification sound

`assets/sounds/incoming.mp3` plays whenever a DM or group message arrives
that isn't your own echo and you're not set to "не беспокоить" —
`SocketContext` triggers it via `src/utils/sound.ts` (expo-av). This only
fires while the app is in the foreground; there's no background push
infrastructure behind it yet, so it won't play with the app closed or
backgrounded. To swap the sound, replace that file (keep the same name) or
change the path in `src/utils/sound.ts`.

## Photo attachments

Tap 📎 in a chat to send a photo. Anything over `MAX_ATTACHMENT_BYTES`
(`src/config.ts`, kept in sync with the backend's 8 MB default) gets a
warning instead of an upload — sending larger files directly between two
online devices is planned but not built yet. Received images are downloaded
once via `src/utils/attachmentCache.ts` (an authenticated `expo-file-system`
download) and cached under the app's document directory, so — like the rest
of the chat history — they're viewable offline after the first load without
re-fetching.

## Structure

- `src/api` — REST client (axios) + secure token storage
- `src/db` — local SQLite message/group-message log and read state (offline-first source of truth for chat UI)
- `src/components` — `AttachmentImage` (cached image bubble), `ImageViewerModal` (fullscreen tap-to-view)
- `src/context/AuthContext` — login/register/logout, session restore, profile updates
- `src/context/SocketContext` — WebSocket connection with reconnect/heartbeat, message/group-message/presence/typing events, outbox flush, notification sound
- `src/screens` — Login, Register, Contacts (contacts + groups + requests + blocked, unread badges, status picker), Chat, GroupChat, CreateGroup, Profile
- `src/navigation` — auth-gated stack navigator
