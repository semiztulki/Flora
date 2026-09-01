import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

import * as groupsApi from "../api/groups";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  getMaxGroupServerId,
  getMessagesForGroup,
  insertPendingGroupMessage,
  LocalGroupMessage,
  markGroupRead,
  upsertConfirmedGroupMessage,
} from "../db/groupMessages";
import { RootStackParamList } from "../types";
import { generateClientId } from "../utils/uuid";

type Props = NativeStackScreenProps<RootStackParamList, "GroupChat">;

export default function GroupChatScreen({ route, navigation }: Props) {
  const { group } = route.params;
  const { user } = useAuth();
  const { sendGroupMessage, onGroupMessage } = useSocket();
  const [messages, setMessages] = useState<LocalGroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<LocalGroupMessage>>(null);

  const memberNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const member of group.members) map[member.id] = member.display_name;
    return map;
  }, [group.members]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: group.name });
  }, [navigation, group]);

  const refreshFromLocalDb = useCallback(async () => {
    const rows = await getMessagesForGroup(group.id);
    setMessages(rows);
    const maxId = await getMaxGroupServerId(group.id);
    if (maxId) await markGroupRead(group.id, maxId);
  }, [group.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const localRows = await getMessagesForGroup(group.id);
      if (!cancelled) setMessages(localRows);

      try {
        const sinceId = await getMaxGroupServerId(group.id);
        const fresh = await groupsApi.fetchGroupHistory(group.id, sinceId);
        for (const m of fresh) {
          await upsertConfirmedGroupMessage({
            serverId: m.id,
            clientId: m.client_id,
            groupId: m.group_id,
            senderId: m.sender_id,
            body: m.body,
            createdAt: m.created_at,
          });
        }
        if (fresh.length > 0 && !cancelled) await refreshFromLocalDb();
      } catch {
        // Offline — the locally cached history already loaded above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [group.id, refreshFromLocalDb]);

  useEffect(() => {
    return onGroupMessage((message) => {
      if (message.group_id !== group.id) return;
      upsertConfirmedGroupMessage({
        serverId: message.id,
        clientId: message.client_id,
        groupId: message.group_id,
        senderId: message.sender_id,
        body: message.body,
        createdAt: message.created_at,
      }).then(refreshFromLocalDb);
    });
  }, [onGroupMessage, group.id, refreshFromLocalDb]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || !user) return;
    setDraft("");

    const clientId = generateClientId();
    const createdAt = new Date().toISOString();
    await insertPendingGroupMessage({
      clientId,
      groupId: group.id,
      senderId: user.id,
      body,
      createdAt,
    });
    await refreshFromLocalDb();
    sendGroupMessage(group.id, body, clientId);
  }, [draft, sendGroupMessage, group.id, user, refreshFromLocalDb]);

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
              {!isMine && (
                <Text style={styles.senderName}>
                  {memberNames[item.senderId] ?? "Участник"}
                </Text>
              )}
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
  senderName: { fontSize: 12, fontWeight: "700", color: "#2f9e44", marginBottom: 2 },
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
