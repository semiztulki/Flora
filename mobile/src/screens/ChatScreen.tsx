import * as ImagePicker from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as attachmentsApi from "../api/attachments";
import * as messagesApi from "../api/messages";
import AttachmentImage from "../components/AttachmentImage";
import ContactAvatar from "../components/ContactAvatar";
import ImageViewerModal from "../components/ImageViewerModal";
import { MAX_ATTACHMENT_BYTES } from "../config";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  getLastReadServerId,
  getMaxServerId,
  getMessagesForPeer,
  insertPendingMessage,
  LocalAttachment,
  LocalMessage,
  markRead,
  upsertConfirmedMessage,
} from "../db/messages";
import { PresenceStatus, RootStackParamList } from "../types";
import { statusColor, statusLabel } from "../utils/presence";
import { generateClientId } from "../utils/uuid";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

const TYPING_SEND_THROTTLE_MS = 3_000;
const TYPING_EXPIRE_MS = 5_000;

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

function toLocalAttachment(
  attachment: { id: number; content_type: string; size_bytes: number; width: number | null; height: number | null } | null
): LocalAttachment | null {
  if (!attachment) return null;
  return {
    id: attachment.id,
    contentType: attachment.content_type,
    sizeBytes: attachment.size_bytes,
    width: attachment.width,
    height: attachment.height,
  };
}

export default function ChatScreen({ route, navigation }: Props) {
  const { contact } = route.params;
  const { user } = useAuth();
  const { sendMessage, onMessage, sendTyping, onTyping, onPresence } = useSocket();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [contactStatus, setContactStatus] = useState<PresenceStatus>(contact.status);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const listRef = useRef<FlatList<LocalMessage>>(null);
  // `messages` is stored oldest-first; the FlatList is `inverted` (the
  // standard, robust way to keep a chat pinned to its newest message without
  // fighting FlatList's lazy measurement — scrollToEnd on a plain list is
  // unreliable once there's enough content that not everything is rendered
  // up front), which expects newest-first data.
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  // Captured once, before the initial load marks the backlog as read, so we
  // can land the list at the first message that arrived since you were last
  // here instead of at the very bottom — landing at the bottom would bury
  // a whole offline backlog above the fold instead of starting you reading
  // it from the top, the way Telegram's "unread messages" jump does.
  const initialReadWatermark = useRef<number | null>(null);
  const hasScrolledToUnread = useRef(false);
  const lastTypingSentAt = useRef(0);
  const typingExpireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: contact.display_name });
  }, [navigation, contact]);

  // The contact param is a snapshot from whenever their row was tapped on
  // the Contacts screen — keep the status live while the chat is open
  // instead of leaving it stuck at that moment.
  useEffect(() => {
    return onPresence((userId, status, _lastSeen, note) => {
      if (userId !== contact.id) return;
      setContactStatus(status);
      setContactNote(note);
    });
  }, [onPresence, contact.id]);

  useEffect(() => {
    return onTyping((senderId, recipientId) => {
      if (senderId !== contact.id || recipientId !== user?.id) return;
      setIsContactTyping(true);
      if (typingExpireTimer.current) clearTimeout(typingExpireTimer.current);
      typingExpireTimer.current = setTimeout(() => setIsContactTyping(false), TYPING_EXPIRE_MS);
    });
  }, [onTyping, contact.id, user?.id]);

  useEffect(() => {
    return () => {
      if (typingExpireTimer.current) clearTimeout(typingExpireTimer.current);
    };
  }, []);

  const handleDraftChange = (text: string) => {
    setDraft(text);
    const now = Date.now();
    if (now - lastTypingSentAt.current > TYPING_SEND_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      sendTyping({ recipientId: contact.id });
    }
  };

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
      // Must happen before anything below marks messages read — this is the
      // one chance to see the watermark as it was when the chat was opened.
      initialReadWatermark.current = await getLastReadServerId(contact.id);

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
            attachment: toLocalAttachment(m.attachment),
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

  // Once, the first time messages actually render: jump to the first
  // message that arrived since the watermark captured above, so an offline
  // backlog is read top-down from where you left off instead of opening at
  // the very bottom and burying it above the fold. Skipped (stays at the
  // natural inverted-list resting position, i.e. the bottom) once there's
  // nothing unread — the common case.
  useEffect(() => {
    if (hasScrolledToUnread.current) return;
    if (initialReadWatermark.current === null) return;
    if (messages.length === 0) return;

    const watermark = initialReadWatermark.current;
    hasScrolledToUnread.current = true;
    const firstUnreadIndex = messages.findIndex(
      (m) => m.serverId !== null && m.serverId > watermark
    );
    if (firstUnreadIndex === -1) return;

    const reversedIndex = messages.length - 1 - firstUnreadIndex;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: reversedIndex, animated: false, viewPosition: 0.85 });
    });
  }, [messages]);

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
        attachment: toLocalAttachment(message.attachment),
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

  const handleAttachImage = useCallback(async () => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Нет доступа", "Разрешите доступ к галерее, чтобы отправлять фото.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    if ((asset.fileSize ?? 0) > MAX_ATTACHMENT_BYTES) {
      Alert.alert(
        "Файл слишком большой",
        `Максимальный размер фото через сервер — ${formatMb(MAX_ATTACHMENT_BYTES)} МБ. ` +
          "Прямая передача больших файлов между двумя устройствами (только когда оба онлайн — как раньше в ICQ) пока в разработке."
      );
      return;
    }

    setIsUploading(true);
    try {
      const fileName = asset.fileName ?? `photo-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? "image/jpeg";
      const uploaded = await attachmentsApi.uploadAttachment(asset.uri, fileName, mimeType);

      const clientId = generateClientId();
      const createdAt = new Date().toISOString();
      const attachment: LocalAttachment = {
        id: uploaded.id,
        contentType: uploaded.content_type,
        sizeBytes: uploaded.size_bytes,
        width: uploaded.width,
        height: uploaded.height,
      };
      await insertPendingMessage({
        clientId,
        senderId: user.id,
        recipientId: contact.id,
        peerId: contact.id,
        body: "",
        attachment,
        createdAt,
      });
      await refreshFromLocalDb();
      sendMessage(contact.id, "", clientId, uploaded.id);
    } catch (e: any) {
      Alert.alert(
        "Не удалось отправить фото",
        e?.response?.data?.detail ?? "Попробуйте ещё раз"
      );
    } finally {
      setIsUploading(false);
    }
  }, [user, contact.id, sendMessage, refreshFromLocalDb]);

  const handleMessageLongPress = useCallback(
    (item: LocalMessage) => {
      if (item.senderId === user?.id || !item.serverId) return;
      Alert.alert(contact.display_name, undefined, [
        { text: "Отмена", style: "cancel" },
        {
          text: "Пожаловаться",
          onPress: () =>
            navigation.navigate("Report", {
              reportedUin: contact.uin,
              reportedDisplayName: contact.display_name,
              messageId: item.serverId!,
            }),
        },
      ]);
    },
    [user?.id, contact, navigation]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Pressable
        style={styles.statusRow}
        onPress={() => navigation.navigate("PublicProfile", { uin: contact.uin })}
        hitSlop={8}
      >
        <View style={[styles.statusDot, { backgroundColor: statusColor[contactStatus] }]} />
        <View style={styles.statusTextCol}>
          <Text style={styles.statusText}>
            {statusLabel[contactStatus]}
            {contactNote ? ` · ${contactNote}` : ""}
          </Text>
        </View>
        <Text style={styles.statusChevron}>› профиль</Text>
        <ContactAvatar
          avatar={contact.avatar}
          label={contact.display_name}
          size={32}
          style={styles.headerAvatar}
        />
      </Pressable>
      <FlatList
        ref={listRef}
        inverted
        data={reversedMessages}
        keyExtractor={(item) => String(item.localId)}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={(info) => {
          // Happens when scrollToIndex fires before FlatList has measured
          // that far (common with dynamically-sized bubbles/images) — retry
          // once layout has caught up instead of silently failing.
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
              viewPosition: 0.85,
            });
          }, 100);
        }}
        renderItem={({ item }) => {
          // TEMP TESTING HACK (remove after sound/incoming testing is done):
          // in a self-chat there's no real "other side", so every message
          // renders as incoming (and gets the incoming sound, see
          // SocketContext) instead of always showing as your own sent bubble.
          const isSelfChatTestMode = contact.id === user?.id;
          const isMine = item.senderId === user?.id && !isSelfChatTestMode;
          const time = new Date(item.createdAt).toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <Pressable
              style={styles.transcriptLine}
              onLongPress={() => handleMessageLongPress(item)}
            >
              <Text style={styles.transcriptHeader}>
                <Text style={isMine ? styles.senderNameMine : styles.senderNameTheirs}>
                  {isMine ? user?.display_name : contact.display_name}
                </Text>
                <Text style={styles.timestamp}> ({time}){item.status === "pending" ? " · отправка…" : ""}:</Text>
              </Text>
              {item.attachment && (
                <AttachmentImage attachment={item.attachment} onPress={setViewerUri} />
              )}
              {item.body.length > 0 && <Text style={styles.messageBody}>{item.body}</Text>}
            </Pressable>
          );
        }}
      />
      {isContactTyping && (
        <Text style={styles.typingIndicator}>{contact.display_name} печатает…</Text>
      )}
      <View style={styles.toolbarRow}>
        <Pressable style={styles.toolbarButton} onPress={handleAttachImage} disabled={isUploading}>
          {isUploading ? (
            <ActivityIndicator size="small" color="#2f9e44" />
          ) : (
            <Text style={styles.toolbarIcon}>📎</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Сообщение"
          value={draft}
          onChangeText={handleDraftChange}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={!draft.trim()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  // Classic-ICQ-style chat chrome: a small header strip with the contact's
  // portrait (rather than a chat-bubble UI), and a plain scrolling
  // transcript — "Name (HH:MM): message" — instead of colored bubbles.
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#eaf7ea",
    borderBottomWidth: 1,
    borderBottomColor: "#b9dfae",
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  headerAvatar: { marginLeft: 10 },
  statusTextCol: { flex: 1, marginLeft: 10 },
  statusText: { fontSize: 12, color: "#495057" },
  statusChevron: { fontSize: 11, color: "#5c7cfa", marginLeft: 8 },
  list: { padding: 16 },
  transcriptLine: { marginBottom: 10 },
  transcriptHeader: { fontSize: 13 },
  senderNameMine: { fontWeight: "700", color: "#1864ab" },
  senderNameTheirs: { fontWeight: "700", color: "#d9480f" },
  timestamp: { color: "#868e96" },
  messageBody: { fontSize: 15, color: "#212529", marginTop: 2 },
  typingIndicator: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#868e96",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  toolbarRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f3f5",
  },
  toolbarButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#b9dfae",
    backgroundColor: "#f6fbf6",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarIcon: { fontSize: 16 },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonText: { color: "#fff", fontWeight: "600" },
});
