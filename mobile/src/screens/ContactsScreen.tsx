import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { Group, RootStackParamList, User } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Contacts">;

type Row =
  | { kind: "contact"; contact: User }
  | { kind: "group"; group: Group };

const statusColor: Record<User["status"], string> = {
  online: "#2f9e44",
  away: "#f08c00",
  offline: "#adb5bd",
};

export default function ContactsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { onPresence, onMessage, onGroupMessage, isConnected } = useSocket();
  const [contacts, setContacts] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [unreadGroups, setUnreadGroups] = useState<Record<number, number>>({});
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setContacts(await contactsApi.fetchContacts());
  }, []);

  const loadGroups = useCallback(async () => {
    setGroups(await groupsApi.fetchGroups());
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
  }, [loadContacts, loadGroups]);

  // Unread badges (and the groups list, if you were just added to one) can
  // change while this screen is backgrounded — recompute on focus.
  useFocusEffect(
    useCallback(() => {
      refreshUnread();
      refreshUnreadGroups();
      loadGroups();
    }, [refreshUnread, refreshUnreadGroups, loadGroups])
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
    try {
      const contact = await contactsApi.addContact(newUsername.trim());
      setContacts((prev) => [...prev, contact]);
      setNewUsername("");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось добавить контакт");
    }
  };

  const sections = [
    {
      title: "Контакты",
      data: contacts.map((contact): Row => ({ kind: "contact", contact })),
    },
    {
      title: "Группы",
      data: groups.map((group): Row => ({ kind: "group", group })),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Привет, {user?.display_name}</Text>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Выйти</Text>
        </Pressable>
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

      <SectionList
        sections={sections}
        keyExtractor={(item) =>
          item.kind === "contact" ? `c-${item.contact.id}` : `g-${item.group.id}`
        }
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
          if (item.kind === "contact") {
            const unreadCount = unread[item.contact.id] ?? 0;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("Chat", { contact: item.contact })}
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
        }}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <Text style={styles.empty}>
              {section.title === "Группы" ? "Пока нет групп" : "Пока нет контактов"}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 56, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700" },
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
});
