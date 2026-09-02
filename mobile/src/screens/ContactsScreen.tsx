import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";

import * as contactsApi from "../api/contacts";
import * as groupsApi from "../api/groups";
import ContactAvatar from "../components/ContactAvatar";
import ContextMenu, { ContextMenuSection } from "../components/ContextMenu";
import StatusPickerModal, { StatusUpdate } from "../components/StatusPickerModal";
import TextPromptModal from "../components/TextPromptModal";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { clearMessagesForPeer, getUnreadCounts, upsertConfirmedMessage } from "../db/messages";
import { getUnreadGroupCounts, upsertConfirmedGroupMessage } from "../db/groupMessages";
import { BlockedUser, ContactRequest, Group, RootStackParamList, SettableStatus, User } from "../types";
import { statusColor, statusLabel } from "../utils/presence";

type Props = NativeStackScreenProps<RootStackParamList, "Contacts">;

type Row =
  | { kind: "request"; request: ContactRequest }
  | { kind: "contact"; contact: User }
  | { kind: "group"; group: Group }
  | { kind: "blocked"; blocked: BlockedUser };

// Your own private label for a contact, if you've set one ("Лена —
// реставратор") — falls back to their nickname otherwise.
function contactDisplayName(contact: User): string {
  return contact.local_nickname || contact.display_name;
}

export default function ContactsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { onPresence, onMessage, onGroupMessage, onContactRequest, setPresence, isConnected } =
    useSocket();
  const [contacts, setContacts] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [unreadGroups, setUnreadGroups] = useState<Record<number, number>>({});
  const [newUin, setNewUin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<SettableStatus>("available");
  const [myInvisible, setMyInvisible] = useState(false);
  const [myNote, setMyNote] = useState("");
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [renamingContact, setRenamingContact] = useState<User | null>(null);
  const [contextMenuContact, setContextMenuContact] = useState<User | null>(null);

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

  // Seed the header indicator from whatever the server already has on record
  // (e.g. a status set from another device, or restored after app restart)
  // rather than always starting the picker back at "available".
  useEffect(() => {
    if (!user) return;
    setMyStatus(user.status === "offline" ? "available" : user.status);
    setMyInvisible(user.invisible);
    setMyNote(user.status_note ?? "");
  }, [user]);

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
    return onPresence((userId, status, lastSeen, note) => {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === userId ? { ...c, status, last_seen: lastSeen, status_note: note } : c
        )
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

  // The knock sound itself plays globally from SocketContext regardless of
  // which screen is open — this just keeps the visible list live while
  // you're actually looking at it, instead of waiting for the next focus.
  useEffect(() => {
    return onContactRequest(() => {
      loadRequests();
    });
  }, [onContactRequest, loadRequests]);

  const handleAddContact = async () => {
    setError(null);
    setInfo(null);
    try {
      const result = await contactsApi.addContact(Number(newUin));
      if (result.relationship_status === "accepted") {
        setContacts((prev) => [...prev, result.contact]);
      } else {
        setInfo(`Заявка отправлена пользователю ${result.contact.display_name}`);
      }
      setNewUin("");
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
          const blockedUser = await contactsApi.blockUser(contact.uin);
          setContacts((prev) => prev.filter((c) => c.id !== contact.id));
          setBlocked((prev) => [...prev, blockedUser]);
        },
      },
    ]);
  };

  const handleToggleInvisibleVisibility = async (contact: User) => {
    const updated = await contactsApi.setVisibleWhenInvisible(
      contact.id,
      !contact.visible_when_invisible
    );
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contact.id ? { ...c, visible_when_invisible: updated.visible_when_invisible } : c
      )
    );
  };

  const handleClearDialog = (contact: User) => {
    Alert.alert(
      "Очистить диалог?",
      `История переписки с ${contact.display_name} удалится с этого устройства (у собеседника останется своя копия).`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Очистить",
          style: "destructive",
          onPress: async () => {
            await clearMessagesForPeer(contact.id);
            setUnread((prev) => ({ ...prev, [contact.id]: 0 }));
          },
        },
      ]
    );
  };

  const handleRemoveContact = (contact: User) => {
    Alert.alert(
      "Удалить из контактов?",
      `${contact.display_name} будет удалён(а) из списка контактов.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            await contactsApi.removeContact(contact.id);
            setContacts((prev) => prev.filter((c) => c.id !== contact.id));
          },
        },
      ]
    );
  };

  // Deliberately two separate actions, not one instead of the other: you
  // block someone for any reason (an unwanted admirer, say), you report
  // someone because their behaviour needs a moderator's attention.
  const contactMenuSections = (contact: User): ContextMenuSection[] => {
    // Reporting/blocking/toggling your own invisible-visibility makes no
    // sense on yourself — the server rejects report/block anyway, but
    // there's no reason to show any of the three. Clearing the dialog and
    // removing the contact still make sense even for your own notes-to-self.
    const isSelf = contact.id === user?.id;
    const sections: ContextMenuSection[] = [];

    if (!isSelf) {
      sections.push({
        items: [
          { label: "Профиль", onPress: () => navigation.navigate("PublicProfile", { uin: contact.uin }) },
        ],
      });
      sections.push({
        title: "Контакт",
        items: [
          {
            label: contact.local_nickname ? "Переименовать для себя" : "Подписать для себя",
            onPress: () => setRenamingContact(contact),
          },
          {
            label: contact.visible_when_invisible
              ? "Не показывать ей(ему) мой инвиз"
              : "Показывать ей(ему) мой инвиз",
            onPress: () => handleToggleInvisibleVisibility(contact),
          },
        ],
      });
    }

    sections.push({
      items: [
        { label: "Очистить диалог", onPress: () => handleClearDialog(contact) },
        ...(!isSelf
          ? [
              {
                label: "Пожаловаться",
                onPress: () =>
                  navigation.navigate("Report", {
                    reportedUin: contact.uin,
                    reportedDisplayName: contact.display_name,
                  }),
              },
              {
                label: "Заблокировать",
                destructive: true,
                onPress: () => confirmBlock(contact),
              },
            ]
          : []),
        {
          label: "Удалить из контактов",
          destructive: true,
          onPress: () => handleRemoveContact(contact),
        },
      ],
    });

    return sections;
  };

  const handleUnblock = async (blockedUser: BlockedUser) => {
    await contactsApi.unblockUser(blockedUser.uin);
    setBlocked((prev) => prev.filter((b) => b.id !== blockedUser.id));
  };

  const handleApplyStatus = (update: StatusUpdate) => {
    setMyStatus(update.status);
    setMyInvisible(update.invisible);
    setMyNote(update.note);
    setPresence(update);
  };

  const handleRenameContact = async (nickname: string) => {
    if (!renamingContact) return;
    const updated = await contactsApi.setLocalNickname(renamingContact.id, nickname || null);
    setContacts((prev) =>
      prev.map((c) => (c.id === renamingContact.id ? { ...c, local_nickname: updated.local_nickname } : c))
    );
    setRenamingContact(null);
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
      <View style={styles.titleBar}>
        <Text style={styles.titleBarText}>🌸 Flora — {user?.display_name}</Text>
        <View style={styles.toolbar}>
          <Pressable style={styles.toolbarButton} onPress={() => navigation.navigate("Search")}>
            <Text style={styles.toolbarIcon}>🔍</Text>
          </Pressable>
          {user?.is_admin && (
            <Pressable style={styles.toolbarButton} onPress={() => navigation.navigate("Admin")}>
              <Text style={styles.toolbarIcon}>🛡️</Text>
            </Pressable>
          )}
          <Pressable style={styles.toolbarButton} onPress={() => navigation.navigate("Profile")}>
            <Text style={styles.toolbarIcon}>👤</Text>
          </Pressable>
          <Pressable style={styles.toolbarButton} onPress={logout}>
            <Text style={styles.toolbarIcon}>🚪</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.statusPill} onPress={() => setStatusPickerVisible(true)}>
        <View
          style={[
            styles.statusPillDot,
            { backgroundColor: statusColor[myStatus] },
            myInvisible && styles.dotInvisibleRing,
          ]}
        />
        <Text style={styles.statusPillText} numberOfLines={1}>
          {statusLabel[myStatus]}
          {myInvisible ? " (невидимый)" : ""}
          {myNote.length > 0 ? ` · ${myNote}` : ""}
        </Text>
        <Text style={styles.statusPillChevron}>▾</Text>
      </Pressable>

      <View style={styles.body}>
      {!isConnected && <Text style={styles.warning}>Соединение потеряно, переподключение…</Text>}

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Номер контакта (UIN)"
          keyboardType="number-pad"
          maxLength={5}
          value={newUin}
          onChangeText={(text) => setNewUin(text.replace(/[^0-9]/g, ""))}
        />
        <Pressable style={styles.addButton} onPress={handleAddContact} disabled={newUin.length !== 5}>
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
            <Text style={styles.sectionTitle}>▾ {section.title?.toUpperCase()}</Text>
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
                  <Text style={styles.subtitle}>№ {item.request.uin}</Text>
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
            const isSelf = item.contact.id === user?.id;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("Chat", { contact: item.contact })}
                onLongPress={() => setContextMenuContact(item.contact)}
              >
                {!isSelf ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => navigation.navigate("PublicProfile", { uin: item.contact.uin })}
                  >
                    <ContactAvatar
                      avatar={item.contact.avatar}
                      label={contactDisplayName(item.contact)}
                      statusColor={statusColor[item.contact.status]}
                      style={styles.rowAvatar}
                    />
                  </Pressable>
                ) : (
                  <ContactAvatar
                    avatar={item.contact.avatar}
                    label={contactDisplayName(item.contact)}
                    statusColor={statusColor[item.contact.status]}
                    style={styles.rowAvatar}
                  />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.name}>
                    {contactDisplayName(item.contact)}
                    {item.contact.id === user?.id ? " (Заметки для себя)" : ""}
                  </Text>
                  <Text style={styles.subtitle}>№ {item.contact.uin}</Text>
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
                  <Text style={styles.subtitle}>{item.group.members.length} участников</Text>
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
                <Text style={styles.subtitle}>№ {item.blocked.uin}</Text>
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
      </View>

      <StatusPickerModal
        visible={statusPickerVisible}
        onClose={() => setStatusPickerVisible(false)}
        currentStatus={myStatus}
        currentInvisible={myInvisible}
        currentNote={myNote}
        onApply={handleApplyStatus}
      />

      <TextPromptModal
        visible={renamingContact !== null}
        title={`Подпись для ${renamingContact?.display_name ?? ""}`}
        placeholder="Например: Лена — реставратор"
        initialValue={renamingContact?.local_nickname ?? ""}
        onCancel={() => setRenamingContact(null)}
        onConfirm={handleRenameContact}
      />

      <ContextMenu
        visible={contextMenuContact !== null}
        onClose={() => setContextMenuContact(null)}
        title={contextMenuContact ? contactDisplayName(contextMenuContact) : undefined}
        sections={contextMenuContact ? contactMenuSections(contextMenuContact) : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6fbf6" },
  // Classic-ICQ-flavoured chrome: a title bar up top, a status "dropdown"
  // pill right below it (matching how the old client always put a nickname
  // header and a status selector above the actual contact tree), toolbar
  // icons styled as small raised buttons instead of plain text links.
  titleBar: {
    backgroundColor: "#dff0d8",
    borderBottomWidth: 1,
    borderBottomColor: "#b9dfae",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleBarText: { fontSize: 16, fontWeight: "700", color: "#1e7a33", flexShrink: 1 },
  toolbar: { flexDirection: "row", gap: 6 },
  toolbarButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#b9dfae",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarIcon: { fontSize: 14 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
  },
  statusPillDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusPillText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#212529" },
  statusPillChevron: { color: "#868e96", marginLeft: 8 },
  body: { flex: 1, paddingHorizontal: 16 },
  link: { color: "#5c7cfa" },
  warning: { color: "#f08c00", marginTop: 8 },
  addRow: { flexDirection: "row", marginTop: 12, marginBottom: 8 },
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
    backgroundColor: "#eaf7ea",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: "#1e7a33" },
  sectionAction: { color: "#2f9e44", fontWeight: "600", fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  rowAvatar: { marginRight: 12 },
  groupDot: { backgroundColor: "#5c7cfa" },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  subtitle: { color: "#868e96" },
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
  dotInvisibleRing: { borderWidth: 2, borderColor: "#868e96" },
  headerNote: { fontSize: 11, color: "#868e96", maxWidth: 160 },
});
