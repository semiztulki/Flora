import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { getPendingMessages } from "../db/messages";
import { getPendingGroupMessages } from "../db/groupMessages";
import { WS_URL } from "../config";
import { useAuth } from "./AuthContext";
import { GroupMessage, Message, PresenceStatus, ServerEvent, SettableStatus } from "../types";
import { playIncomingSound } from "../utils/sound";

type MessageListener = (message: Message) => void;
type GroupMessageListener = (message: GroupMessage) => void;
type PresenceListener = (userId: number, status: PresenceStatus, lastSeen: string) => void;
type TypingListener = (senderId: number, recipientId?: number, groupId?: number) => void;

interface SocketContextValue {
  sendMessage: (recipientId: number, body: string, clientId: string) => void;
  sendGroupMessage: (groupId: number, body: string, clientId: string) => void;
  sendTyping: (target: { recipientId?: number; groupId?: number }) => void;
  setPresence: (status: SettableStatus) => void;
  onMessage: (listener: MessageListener) => () => void;
  onGroupMessage: (listener: GroupMessageListener) => () => void;
  onPresence: (listener: PresenceListener) => () => void;
  onTyping: (listener: TypingListener) => () => void;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

const HEARTBEAT_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  // Refs (not state) so the long-lived connect() closure below always sees the
  // latest values without needing to reconnect the socket when they change.
  const currentUserId = useRef<number | undefined>(user?.id);
  useEffect(() => {
    currentUserId.current = user?.id;
  }, [user?.id]);
  const messageListeners = useRef(new Set<MessageListener>());
  const groupMessageListeners = useRef(new Set<GroupMessageListener>());
  const presenceListeners = useRef(new Set<PresenceListener>());
  const typingListeners = useRef(new Set<TypingListener>());
  const [isConnected, setIsConnected] = useState(false);
  // Preserved across reconnects so dropping and regaining signal while
  // invisible/dnd doesn't silently pop the user back to "online".
  const desiredStatus = useRef<SettableStatus>("online");

  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmounted = useRef(false);

  useEffect(() => {
    isUnmounted.current = false;

    const clearTimers = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (pongTimeoutTimer.current) clearTimeout(pongTimeoutTimer.current);
    };

    const flushOutbox = async (socket: WebSocket) => {
      const pending = await getPendingMessages();
      for (const message of pending) {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            type: "message",
            recipient_id: message.recipientId,
            body: message.body,
            client_id: message.clientId,
          })
        );
      }

      const pendingGroup = await getPendingGroupMessages();
      for (const message of pendingGroup) {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            type: "group_message",
            group_id: message.groupId,
            body: message.body,
            client_id: message.clientId,
          })
        );
      }
    };

    const startHeartbeat = (socket: WebSocket) => {
      heartbeatTimer.current = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "ping" }));
        pongTimeoutTimer.current = setTimeout(() => {
          // No pong in time: the connection is likely dead (common on flaky
          // mobile networks that don't send a clean close). Force a reconnect.
          socket.close();
        }, PONG_TIMEOUT_MS);
      }, HEARTBEAT_INTERVAL_MS);
    };

    const connect = () => {
      if (!token || isUnmounted.current) return;

      const socket = new WebSocket(`${WS_URL}/ws?token=${token}&status=${desiredStatus.current}`);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        reconnectAttempt.current = 0;
        startHeartbeat(socket);
        flushOutbox(socket);
      };

      socket.onmessage = (event) => {
        const data: ServerEvent = JSON.parse(event.data);
        if (data.type === "pong") {
          if (pongTimeoutTimer.current) clearTimeout(pongTimeoutTimer.current);
        } else if (data.type === "message") {
          if (data.sender_id !== currentUserId.current && desiredStatus.current !== "dnd") {
            playIncomingSound();
          }
          messageListeners.current.forEach((listener) => listener(data));
        } else if (data.type === "group_message") {
          if (data.sender_id !== currentUserId.current && desiredStatus.current !== "dnd") {
            playIncomingSound();
          }
          groupMessageListeners.current.forEach((listener) => listener(data));
        } else if (data.type === "presence") {
          presenceListeners.current.forEach((listener) =>
            listener(data.user_id, data.status, data.last_seen)
          );
        } else if (data.type === "typing") {
          typingListeners.current.forEach((listener) =>
            listener(data.sender_id, data.recipient_id, data.group_id)
          );
        }
      };

      const handleDrop = () => {
        setIsConnected(false);
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
        if (pongTimeoutTimer.current) clearTimeout(pongTimeoutTimer.current);
        wsRef.current = null;
        if (isUnmounted.current) return;

        const delay = Math.min(
          BASE_BACKOFF_MS * 2 ** reconnectAttempt.current,
          MAX_BACKOFF_MS
        );
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      socket.onclose = handleDrop;
      socket.onerror = handleDrop;
    };

    connect();

    return () => {
      isUnmounted.current = true;
      clearTimers();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]);

  const sendMessage = (recipientId: number, body: string, clientId: string) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "message", recipient_id: recipientId, body, client_id: clientId })
      );
    }
    // If not connected, the caller has already persisted the message locally
    // as 'pending' — it will be sent by flushOutbox() on the next reconnect.
  };

  const sendGroupMessage = (groupId: number, body: string, clientId: string) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "group_message", group_id: groupId, body, client_id: clientId })
      );
    }
  };

  const sendTyping = (target: { recipientId?: number; groupId?: number }) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "typing",
          recipient_id: target.recipientId,
          group_id: target.groupId,
        })
      );
    }
  };

  const setPresence = (status: SettableStatus) => {
    desiredStatus.current = status;
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "presence", status }));
    }
    // If not connected, the new desired status is picked up as the initial
    // status on the next reconnect (see the `status=` query param above).
  };

  const onMessage = (listener: MessageListener) => {
    messageListeners.current.add(listener);
    return () => messageListeners.current.delete(listener);
  };

  const onGroupMessage = (listener: GroupMessageListener) => {
    groupMessageListeners.current.add(listener);
    return () => groupMessageListeners.current.delete(listener);
  };

  const onPresence = (listener: PresenceListener) => {
    presenceListeners.current.add(listener);
    return () => presenceListeners.current.delete(listener);
  };

  const onTyping = (listener: TypingListener) => {
    typingListeners.current.add(listener);
    return () => typingListeners.current.delete(listener);
  };

  return (
    <SocketContext.Provider
      value={{
        sendMessage,
        sendGroupMessage,
        sendTyping,
        setPresence,
        onMessage,
        onGroupMessage,
        onPresence,
        onTyping,
        isConnected,
      }}
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
