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
import * as groupsApi from "../api/groups";
import AttachmentImage from "../components/AttachmentImage";
import ContactAvatar from "../components/ContactAvatar";
import ImageViewerModal from "../components/ImageViewerModal";
import { MAX_ATTACHMENT_BYTES } from "../config";
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
import { LocalAttachment } from "../db/messages";
import { RootStackParamList } from "../types";
import { generateClientId } from "../utils/uuid";

type Props = NativeStackScreenProps<RootStackParamList, "GroupChat">;

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

export default function GroupChatScreen({ route, navigation }: Props) {
  const { group } = route.params;
  const { user } = useAuth();
  const { sendGroupMessage, onGroupMessage, sendTyping, onTyping } = useSocket();
  const [messages, setMessages] = useState<LocalGroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typingUserIds, setTypingUserIds] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const listRef = useRef<FlatList<LocalGroupMessage>>(null);
  // Same reasoning as ChatScreen: inverted + reversed data is the robust way
  // to keep a chat pinned to its newest message (scrollToEnd on a plain list
  // is unreliable once there's enough content that not everything is
  // rendered up front).
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const lastTypingSentAt = useRef(0);
  const typingExpireTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const memberNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const member of group.members) map[member.id] = member.display_name;
    return map;
  }, [group.members]);

  const memberByUserId = useMemo(() => {
    const map = new Map<number, (typeof group.members)[number]>();
    for (const member of group.members) map.set(member.id, member);
    return map;
  }, [group.members]);

  const typingLabel = typingUserIds.length > 0 ? typingUserIds.map((id) => memberNames[id] ?? "кто-то").join(", ") + " печатает…" : null;

  useLayoutEffect(() => {
    navigation.setOptions({ title: typingLabel ?? group.name });
  }, [navigation, group, typingLabel]);

  useEffect(() => {
    return onTyping((senderId, _recipientId, groupId) => {
      if (groupId !== group.id || senderId === user?.id) return;
      setTypingUserIds((prev) => (prev.includes(senderId) ? prev : [...prev, senderId]));

      const existing = typingExpireTimers.current.get(senderId);
      if (existing) clearTimeout(existing);
      typingExpireTimers.current.set(
        senderId,
        setTimeout(() => {
          setTypingUserIds((prev) => prev.filter((id) => id !== senderId));
          typingExpireTimers.current.delete(senderId);
        }, TYPING_EXPIRE_MS)
      );
    });
  }, [onTyping, group.id, user?.id]);

  useEffect(() => {
    const timers = typingExpireTimers.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const handleDraftChange = (text: string) => {
    setDraft(text);
    const now = Date.now();
    if (now - lastTypingSentAt.current > TYPING_SEND_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      sendTyping({ groupId: group.id });
    }
  };

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
            attachment: toLocalAttachment(m.attachment),
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
        attachment: toLocalAttachment(message.attachment),
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
          "Прямая передача больших файлов между устройствами (только когда всё в сети) пока в разработке."
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
      await insertPendingGroupMessage({
        clientId,
        groupId: group.id,
        senderId: user.id,
        body: "",
        attachment,
        createdAt,
      });
      await refreshFromLocalDb();
      sendGroupMessage(group.id, "", clientId, uploaded.id);
    } catch (e: any) {
      Alert.alert(
        "Не удалось отправить фото",
        e?.response?.data?.detail ?? "Попробуйте ещё раз"
      );
    } finally {
      setIsUploading(false);
    }
  }, [user, group.id, sendGroupMessage, refreshFromLocalDb]);

  const handleMessageLongPress = useCallback(
    (item: LocalGroupMessage) => {
      if (item.senderId === user?.id || !item.serverId) return;
      const sender = memberByUserId.get(item.senderId);
      if (!sender) return;
      Alert.alert(sender.display_name, undefined, [
        { text: "Отмена", style: "cancel" },
        {
          text: "Пожаловаться",
          onPress: () =>
            navigation.navigate("Report", {
              reportedUin: sender.uin,
              reportedDisplayName: sender.display_name,
              groupMessageId: item.serverId!,
            }),
        },
      ]);
    },
    [user?.id, memberByUserId, navigation]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.groupHeader}>
        {/* No per-group avatar field on the backend yet — the initial-letter
            square doubles as a plain group icon, same idea as a contact's
            buddy icon placeholder. */}
        <ContactAvatar avatar={null} label={group.name} size={72} />
        <View style={styles.groupHeaderTextCol}>
          <Text style={styles.groupHeaderName} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.groupHeaderMembers}>
            {group.members.length} участников
          </Text>
        </View>
      </View>
      <FlatList
        ref={listRef}
        inverted
        data={reversedMessages}
        keyExtractor={(item) => String(item.localId)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id;
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
                  {isMine ? user?.display_name : memberNames[item.senderId] ?? "Участник"}
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#eaf7ea",
    borderBottomWidth: 1,
    borderBottomColor: "#b9dfae",
  },
  groupHeaderTextCol: { flex: 1, marginLeft: 14, gap: 4 },
  groupHeaderName: { fontSize: 17, fontWeight: "700", color: "#212529" },
  groupHeaderMembers: { fontSize: 13, color: "#495057" },
  list: { padding: 16 },
  transcriptLine: { marginBottom: 10 },
  transcriptHeader: { fontSize: 13 },
  senderNameMine: { fontWeight: "700", color: "#1864ab" },
  senderNameTheirs: { fontWeight: "700", color: "#d9480f" },
  timestamp: { color: "#868e96" },
  messageBody: { fontSize: 15, color: "#212529", marginTop: 2 },
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
