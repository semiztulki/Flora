from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[int, set[WebSocket]] = {}

    def is_online(self, user_id: int) -> bool:
        return bool(self.active_connections.get(user_id))

    async def connect(self, user_id: int, websocket: WebSocket) -> bool:
        """Returns True if this is the user's first active connection."""
        await websocket.accept()
        connections = self.active_connections.setdefault(user_id, set())
        first_connection = len(connections) == 0
        connections.add(websocket)
        return first_connection

    def disconnect(self, user_id: int, websocket: WebSocket) -> bool:
        """Returns True if the user has no more active connections."""
        connections = self.active_connections.get(user_id)
        if not connections:
            return True
        connections.discard(websocket)
        if not connections:
            del self.active_connections[user_id]
            return True
        return False

    async def send_to_user(self, user_id: int, payload: dict) -> bool:
        """Best-effort push to every live connection for this user. Returns
        True if it reached at least one of them — callers that track real
        delivery (offline replay, the `delivered` flag) rely on this instead
        of assuming `is_online` means the message actually arrived: a
        connection can still be sitting in this dict while the underlying
        socket is already dead (common on flaky mobile networks, before the
        next failed write or heartbeat timeout notices)."""
        delivered = False
        for websocket in list(self.active_connections.get(user_id, set())):
            try:
                await websocket.send_json(payload)
                delivered = True
            except Exception:
                # Dead socket — drop it now rather than waiting for this
                # connection's own disconnect handling to notice, so the
                # next send doesn't keep retrying a socket that's gone.
                self.disconnect(user_id, websocket)
        return delivered

    async def close_all(self, user_id: int, code: int = 1000) -> None:
        """Forcibly drops every active connection for a user — used to enforce
        a ban immediately instead of waiting for their next reconnect."""
        for websocket in list(self.active_connections.get(user_id, set())):
            await websocket.close(code=code)


manager = ConnectionManager()
