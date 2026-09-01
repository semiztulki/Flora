import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as contactsApi from "../api/contacts";
import * as groupsApi from "../api/groups";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { getUnreadCounts, upsertConfirmedMessage } from "../db/messages";
import { getUnreadGroupCounts, upsertConfirmedGroupMessage } from "../db/groupMessages";
import { BlockedUser, ContactRequest, Group, RootStackParamList, SettableStatus, User } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Contacts">;

type Row =
  | { kind: "request"; request: ContactRequest }
  | { kind: "contact"; contact: User }
  | { kind: "group"; group: Group }
  | { kind: "blocked"; blocked: BlockedUser };

const statusColor: Record<User["status"], string> = {
  online: "#2f9e44",
  away: "#f08c00",
  dnd: "#e03131",
  invisible: "#868e96",
  offline: "#adb5bd",
};

const STATUS_OPTIONS: { value: SettableStatus; label: string }[] = [
  { value: "online", label: "В сети" },
  { value: "away", label: "Отошёл" },
  { value: "dnd", label: "Не беспокоить" },
  { value: "invisible", label: "Невидимка" },
];

export default function ContactsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { onPresence, onMessage, onGroupMessage, setPresence, isConnected } = useSocket();
  const [contacts, setContacts] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [unreadGroups, setUnreadGroups] = useState<Record<number, number>>({});
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<SettableStatus>("online");
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);

  const loadContacts = useCallback(async () => {
    setContacts(await contactsApi.fetchContacts());
  }, []);

  const loadGroups = useCallback(async () => {
    setGroups(await groupsApi.fetchGroups());
  }, []);

  const loadRequests = useCallback(async () => {
    setRequests(await contactsApi.fetchIncomingRequests());
  }, []);

  const loadBlocked = useCallback(async () => {
    setBlocked(await contactsApi.fetchBlocked());
  }, []);

  const refreshUnread = useCallback(async () => {
    setUnread(await getUnreadCounts());
  }, []);

  const refreshUnreadGroups = useCallback(async () => {
    if (!user) return;
    setUnreadGroups(await getUnreadGroupCounts(user.id));
  }, [user]);

  useEffect(() => {
    loadContacts();
    loadGroups();
    loadBlocked();
  }, [loadContacts, loadGroups, loadBlocked]);

  // Requests/unread/groups can all change while this screen is backgrounded —
  // recompute on focus rather than trying to push every possible update live.
  useFocusEffect(
    useCallback(() => {
      refreshUnread();
      refreshUnreadGroups();
      loadGroups();
      loadRequests();
    }, [refreshUnread, refreshUnreadGroups, loadGroups, loadRequests])
  );

  useEffect(() => {
    return onPresence((userId, status, lastSeen) => {
      setContacts((prev) =>
        prev.map((c) => (c.id === userId ? { ...c, status, last_seen: lastSeen } : c))
      );
    });
  }, [onPresence]);

  // Every incoming/outgoing message gets persisted here too (not just inside an
  // open chat) so the local log stays complete and unread badges update live.
  useEffect(() => {
    return onMessage((message) => {
      if (!user) return;
      const peerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      upsertConfirmedMessage({
        serverId: message.id,
        clientId: message.client_id,
        senderId: message.sender_id,
        recipientId: message.recipient_id,
        peerId,
        body: message.body,
        createdAt: message.created_at,
      }).then(refreshUnread);
    });
  }, [onMessage, user, refreshUnread]);

  useEffect(() => {
    return onGroupMessage((message) => {
      upsertConfirmedGroupMessage({
        serverId: message.id,
        clientId: message.client_id,
        groupId: message.group_id,
        senderId: message.sender_id,
        body: message.body,
        createdAt: message.created_at,
      }).then(refreshUnreadGroups);
    });
  }, [onGroupMessage, refreshUnreadGroups]);

  const handleAddContact = async () => {
    setError(null);
    setInfo(null);
    try {
      const result = await contactsApi.addContact(newUsername.trim());
      if (result.relationship_status === "accepted") {
        setContacts((prev) => [...prev, result.contact]);
      } else {
        setInfo(`Заявка отправлена пользователю ${result.contact.display_name}`);
      }
      setNewUsername("");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось добавить контакт");
    }
  };

  const handleAccept = async (request: ContactRequest) => {
    const contact = await contactsApi.acceptRequest(request.id);
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    setContacts((prev) => [...prev, contact]);
  };

  const handleDecline = async (request: ContactRequest) => {
    await contactsApi.declineRequest(request.id);
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const confirmBlock = (contact: User) => {
    Alert.alert("Заблокировать?", `${contact.display_name} больше не сможет вам писать.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Заблокировать",
        style: "destructive",
        onPress: async () => {
          const blockedUser = await contactsApi.blockUser(contact.username);
          setContacts((prev) => prev.filter((c) => c.id !== contact.id));
          setBlocked((prev) => [...prev, blockedUser]);
        },
      },
    ]);
  };

  const handleUnblock = async (blockedUser: BlockedUser) => {
    await contactsApi.unblockUser(blockedUser.username);
    setBlocked((prev) => prev.filter((b) => b.id !== blockedUser.id));
  };

  const handlePickStatus = (status: SettableStatus) => {
    setMyStatus(status);
    setPresence(status);
    setStatusPickerVisible(false);
  };

  const sections = [
    ...(requests.length > 0
      ? [{ title: "Заявки", data: requests.map((request): Row => ({ kind: "request", request })) }]
      : []),
    {
      title: "Контакты",
      data: contacts.map((contact): Row => ({ kind: "contact", contact })),
    },
    {
      title: "Группы",
      data: groups.map((group): Row => ({ kind: "group", group })),
    },
    ...(blocked.length > 0
      ? [
          {
            title: "Заблокированные",
            data: blocked.map((b): Row => ({ kind: "blocked", blocked: b })),
          },
        ]
      : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerName} onPress={() => setStatusPickerVisible(true)}>
          <View style={[styles.dot, { backgroundColor: statusColor[myStatus] }]} />
          <Text style={styles.title}>{user?.display_name}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate("Search")}>
            <Text style={styles.link}>🔍</Text>
          </Pressable>
          {user?.is_admin && (
            <Pressable onPress={() => navigation.navigate("Admin")}>
              <Text style={styles.link}>🛡️</Text>
            </Pressable>
          )}
          <Pressable onPress={() => navigation.navigate("Profile")}>
            <Text style={styles.link}>Профиль</Text>
          </Pressable>
          <Pressable onPress={logout}>
            <Text style={styles.logout}>Выйти</Text>
          </Pressable>
        </View>
      </View>
      {!isConnected && <Text style={styles.warning}>Соединение потеряно, переподключение…</Text>}

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Логин контакта"
          autoCapitalize="none"
          value={newUsername}
          onChangeText={setNewUsername}
        />
        <Pressable style={styles.addButton} onPress={handleAddContact} disabled={!newUsername}>
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}

      <SectionList
        sections={sections}
        keyExtractor={(item) => {
          if (item.kind === "contact") return `c-${item.contact.id}`;
          if (item.kind === "group") return `g-${item.group.id}`;
          if (item.kind === "request") return `r-${item.request.id}`;
          return `b-${item.blocked.id}`;
        }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.title === "Группы" && (
              <Pressable onPress={() => navigation.navigate("CreateGroup")}>
                <Text style={styles.sectionAction}>+ создать</Text>
              </Pressable>
            )}
          </View>
        )}
        renderItem={({ item }) => {
          if (item.kind === "request") {
            return (
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{item.request.display_name}</Text>
                  <Text style={styles.username}>@{item.request.username}</Text>
                </View>
                <Pressable
                  style={[styles.smallButton, styles.acceptButton]}
                  onPress={() => handleAccept(item.request)}
                >
                  <Text style={styles.smallButtonText}>✓</Text>
                </Pressable>
                <Pressable
                  style={[styles.smallButton, styles.declineButton]}
                  onPress={() => handleDecline(item.request)}
                >
                  <Text style={styles.smallButtonText}>✕</Text>
                </Pressable>
              </View>
            );
          }

          if (item.kind === "contact") {
            const unreadCount = unread[item.contact.id] ?? 0;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("Chat", { contact: item.contact })}
                onLongPress={() => confirmBlock(item.contact)}
              >
                <View
                  style={[styles.dot, { backgroundColor: statusColor[item.contact.status] }]}
                />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{item.contact.display_name}</Text>
                  <Text style={styles.username}>@{item.contact.username}</Text>
                </View>
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          }

          if (item.kind === "group") {
            const unreadCount = unreadGroups[item.group.id] ?? 0;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("GroupChat", { group: item.group })}
              >
                <View style={[styles.dot, styles.groupDot]} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{item.group.name}</Text>
                  <Text style={styles.username}>{item.group.members.length} участников</Text>
                </View>
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          }

          return (
            <Pressable style={styles.row} onPress={() => handleUnblock(item.blocked)}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.blocked.display_name}</Text>
                <Text style={styles.username}>@{item.blocked.username}</Text>
              </View>
              <Text style={styles.link}>разблокировать</Text>
            </Pressable>
          );
        }}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 && section.title === "Группы" ? (
            <Text style={styles.empty}>Пока нет групп</Text>
          ) : section.data.length === 0 && section.title === "Контакты" ? (
            <Text style={styles.empty}>Пока нет контактов</Text>
          ) : null
        }
      />

      <Modal
        visible={statusPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setStatusPickerVisible(false)}>
          <View style={styles.modalCard}>
            {STATUS_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={styles.modalOption}
                onPress={() => handlePickStatus(option.value)}
              >
                <View style={[styles.dot, { backgroundColor: statusColor[option.value] }]} />
                <Text style={styles.modalOptionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 56, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerName: { flexDirection: "row", alignItems: "center" },
  headerActions: { flexDirection: "row", gap: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  link: { color: "#5c7cfa" },
  logout: { color: "#c92a2a" },
  warning: { color: "#f08c00", marginBottom: 8 },
  addRow: { flexDirection: "row", marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#2f9e44",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontSize: 22, lineHeight: 22 },
  error: { color: "#c92a2a", marginBottom: 8 },
  info: { color: "#2f9e44", marginBottom: 8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#868e96", textTransform: "uppercase" },
  sectionAction: { color: "#2f9e44", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  groupDot: { backgroundColor: "#5c7cfa" },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  username: { color: "#868e96" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2f9e44",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  empty: { textAlign: "center", color: "#868e96", paddingVertical: 12 },
  smallButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  acceptButton: { backgroundColor: "#2f9e44" },
  declineButton: { backgroundColor: "#c92a2a" },
  smallButtonText: { color: "#fff", fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    width: 240,
  },
  modalOption: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16 },
  modalOptionText: { fontSize: 16 },
});
