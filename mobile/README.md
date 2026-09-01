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

## Structure

- `src/api` — REST client (axios) + secure token storage
- `src/context/AuthContext` — login/register/logout, session restore
- `src/context/SocketContext` — WebSocket connection, message/presence events
- `src/screens` — Login, Register, Contacts (list + add), Chat
- `src/navigation` — auth-gated stack navigator
