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
import { Message, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const { contact } = route.params;
  const { user } = useAuth();
  const { sendMessage, onMessage } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: contact.display_name });
  }, [navigation, contact]);

  useEffect(() => {
    messagesApi.fetchHistory(contact.id).then(setMessages);
  }, [contact.id]);

  useEffect(() => {
    return onMessage((message) => {
      const belongsToThisChat =
        (message.sender_id === contact.id && message.recipient_id === user?.id) ||
        (message.sender_id === user?.id && message.recipient_id === contact.id);
      if (belongsToThisChat) {
        setMessages((prev) => [...prev, message]);
      }
    });
  }, [onMessage, contact.id, user?.id]);

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    sendMessage(contact.id, body);
    setDraft("");
  }, [draft, sendMessage, contact.id]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMine = item.sender_id === user?.id;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
                {item.body}
              </Text>
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
