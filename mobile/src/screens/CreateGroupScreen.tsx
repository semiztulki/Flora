import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as contactsApi from "../api/contacts";
import * as groupsApi from "../api/groups";
import { RootStackParamList, User } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "CreateGroup">;

export default function CreateGroupScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    contactsApi.fetchContacts().then(setContacts);
  }, []);

  const toggle = (uin: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uin)) next.delete(uin);
      else next.add(uin);
      return next;
    });
  };

  const handleCreate = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const group = await groupsApi.createGroup(name.trim(), Array.from(selected));
      navigation.replace("GroupChat", { group });
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось создать группу");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Название группы"
        value={name}
        onChangeText={setName}
      />
      <Text style={styles.subtitle}>Участники</Text>
      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.uin);
          return (
            <Pressable style={styles.row} onPress={() => toggle(item.uin)}>
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]} />
              <View>
                <Text style={styles.name}>{item.display_name}</Text>
                <Text style={styles.rowSubtitle}>№ {item.uin}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Сначала добавьте контакты</Text>}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.button}
        onPress={handleCreate}
        disabled={isSubmitting || !name.trim() || selected.size === 0}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Создать группу</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  subtitle: { fontSize: 14, color: "#868e96", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#adb5bd",
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: "#2f9e44", borderColor: "#2f9e44" },
  name: { fontSize: 16, fontWeight: "600" },
  rowSubtitle: { color: "#868e96" },
  empty: { textAlign: "center", color: "#868e96", marginTop: 24 },
  error: { color: "#c92a2a", marginTop: 8, textAlign: "center" },
  button: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
