import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { WS_URL } from "../config";
import { useAuth } from "./AuthContext";
import { Message, PresenceStatus, ServerEvent } from "../types";

type MessageListener = (message: Message) => void;
type PresenceListener = (userId: number, status: PresenceStatus, lastSeen: string) => void;

interface SocketContextValue {
  sendMessage: (recipientId: number, body: string) => void;
  setPresence: (status: "online" | "away") => void;
  onMessage: (listener: MessageListener) => () => void;
  onPresence: (listener: PresenceListener) => () => void;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const messageListeners = useRef(new Set<MessageListener>());
  const presenceListeners = useRef(new Set<PresenceListener>());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      return;
    }

    const socket = new WebSocket(`${WS_URL}/ws?token=${token}`);
    wsRef.current = socket;

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onerror = () => setIsConnected(false);

    socket.onmessage = (event) => {
      const data: ServerEvent = JSON.parse(event.data);
      if (data.type === "message") {
        messageListeners.current.forEach((listener) => listener(data));
      } else if (data.type === "presence") {
        presenceListeners.current.forEach((listener) =>
          listener(data.user_id, data.status, data.last_seen)
        );
      }
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [token]);

  const sendMessage = (recipientId: number, body: string) => {
    wsRef.current?.send(JSON.stringify({ type: "message", recipient_id: recipientId, body }));
  };

  const setPresence = (status: "online" | "away") => {
    wsRef.current?.send(JSON.stringify({ type: "presence", status }));
  };

  const onMessage = (listener: MessageListener) => {
    messageListeners.current.add(listener);
    return () => messageListeners.current.delete(listener);
  };

  const onPresence = (listener: PresenceListener) => {
    presenceListeners.current.add(listener);
    return () => presenceListeners.current.delete(listener);
  };

  return (
    <SocketContext.Provider
      value={{ sendMessage, setPresence, onMessage, onPresence, isConnected }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
