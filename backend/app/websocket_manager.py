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

    async def send_to_user(self, user_id: int, payload: dict) -> None:
        for websocket in list(self.active_connections.get(user_id, set())):
            await websocket.send_json(payload)


manager = ConnectionManager()
