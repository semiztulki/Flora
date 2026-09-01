import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as messagesApi from "../api/messages";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  getMaxServerId,
  getMessagesForPeer,
  insertPendingMessage,
  LocalMessage,
  markRead,
  upsertConfirmedMessage,
} from "../db/messages";
import { RootStackParamList } from "../types";
import { generateClientId } from "../utils/uuid";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const { contact } = route.params;
  const { user } = useAuth();
  const { sendMessage, onMessage } = useSocket();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<LocalMessage>>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: contact.display_name });
  }, [navigation, contact]);

  const refreshFromLocalDb = useCallback(async () => {
    const rows = await getMessagesForPeer(contact.id);
    setMessages(rows);
    const maxId = await getMaxServerId(contact.id);
    if (maxId) await markRead(contact.id, maxId);
  }, [contact.id]);

  // Offline-first: show what's already on the device immediately, then ask
  // the server only for what's new since our last cached message (delta sync).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const localRows = await getMessagesForPeer(contact.id);
      if (!cancelled) setMessages(localRows);

      try {
        const sinceId = await getMaxServerId(contact.id);
        const fresh = await messagesApi.fetchHistory(contact.id, sinceId);
        for (const m of fresh) {
          await upsertConfirmedMessage({
            serverId: m.id,
            clientId: m.client_id,
            senderId: m.sender_id,
            recipientId: m.recipient_id,
            peerId: contact.id,
            body: m.body,
            createdAt: m.created_at,
          });
        }
        if (fresh.length > 0 && !cancelled) await refreshFromLocalDb();
      } catch {
        // Offline or request failed — the locally cached history already loaded above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contact.id, refreshFromLocalDb]);

  useEffect(() => {
    return onMessage((message) => {
      const belongsToThisChat =
        (message.sender_id === contact.id && message.recipient_id === user?.id) ||
        (message.sender_id === user?.id && message.recipient_id === contact.id);
      if (!belongsToThisChat) return;

      upsertConfirmedMessage({
        serverId: message.id,
        clientId: message.client_id,
        senderId: message.sender_id,
        recipientId: message.recipient_id,
        peerId: contact.id,
        body: message.body,
        createdAt: message.created_at,
      }).then(refreshFromLocalDb);
    });
  }, [onMessage, contact.id, user?.id, refreshFromLocalDb]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || !user) return;
    setDraft("");

    const clientId = generateClientId();
    const createdAt = new Date().toISOString();
    await insertPendingMessage({
      clientId,
      senderId: user.id,
      recipientId: contact.id,
      peerId: contact.id,
      body,
      createdAt,
    });
    await refreshFromLocalDb();
    sendMessage(contact.id, body, clientId);
  }, [draft, sendMessage, contact.id, user, refreshFromLocalDb]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.localId)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
                {item.body}
              </Text>
              {isMine && item.status === "pending" && (
                <Text style={styles.pendingLabel}>отправка…</Text>
              )}
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Сообщение"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={!draft.trim()}>
          <Text style={styles.sendButtonText}>Отпр.</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16 },
  bubble: { maxWidth: "80%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  bubbleMine: { backgroundColor: "#2f9e44", alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: "#f1f3f5", alignSelf: "flex-start" },
  bubbleTextMine: { color: "#fff" },
  bubbleTextTheirs: { color: "#212529" },
  pendingLabel: { color: "#e9ecef", fontSize: 11, marginTop: 2 },
  inputRow: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f3f5",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#2f9e44",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: { color: "#fff", fontWeight: "600" },
});
