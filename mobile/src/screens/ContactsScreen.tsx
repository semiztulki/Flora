import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as contactsApi from "../api/contacts";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { RootStackParamList, User } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Contacts">;

const statusColor: Record<User["status"], string> = {
  online: "#2f9e44",
  away: "#f08c00",
  offline: "#adb5bd",
};

export default function ContactsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const { onPresence, isConnected } = useSocket();
  const [contacts, setContacts] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    const data = await contactsApi.fetchContacts();
    setContacts(data);
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    return onPresence((userId, status, lastSeen) => {
      setContacts((prev) =>
        prev.map((c) => (c.id === userId ? { ...c, status, last_seen: lastSeen } : c))
      );
    });
  }, [onPresence]);

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

      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate("Chat", { contact: item })}>
            <View style={[styles.dot, { backgroundColor: statusColor[item.status] }]} />
            <View>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.username}>@{item.username}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Пока нет контактов</Text>}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  name: { fontSize: 16, fontWeight: "600" },
  username: { color: "#868e96" },
  empty: { textAlign: "center", color: "#868e96", marginTop: 40 },
});
