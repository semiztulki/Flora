import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import * as contactsApi from "../api/contacts";
import * as groupsApi from "../api/groups";
import { useAuth } from "../context/AuthContext";
import { SearchResult, searchMessages } from "../db/search";
import { Group, RootStackParamList, User } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

const SEARCH_DEBOUNCE_MS = 250;

export default function SearchScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    contactsApi.fetchContacts().then(setContacts);
    groupsApi.fetchGroups().then(setGroups);
  }, []);

  const contactsById = useMemo(() => {
    const map = new Map<number, User>();
    for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  const groupsById = useMemo(() => {
    const map = new Map<number, Group>();
    for (const g of groups) map.set(g.id, g);
    return map;
  }, [groups]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const found = await searchMessages(text);
      setResults(found);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handlePressResult = useCallback(
    (result: SearchResult) => {
      if (result.kind === "dm") {
        const contact = contactsById.get(result.chatId);
        if (contact) navigation.navigate("Chat", { contact });
      } else {
        const group = groupsById.get(result.chatId);
        if (group) navigation.navigate("GroupChat", { group });
      }
    },
    [contactsById, groupsById, navigation]
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Поиск по сообщениям"
        value={query}
        onChangeText={handleQueryChange}
        autoFocus
        autoCapitalize="none"
      />
      <FlatList
        data={results}
        keyExtractor={(item, index) => `${item.kind}-${item.chatId}-${item.createdAt}-${index}`}
        renderItem={({ item }) => {
          const isMine = item.senderId === user?.id;
          let title: string;
          let senderPrefix = "";
          if (item.kind === "dm") {
            title = contactsById.get(item.chatId)?.display_name ?? "Контакт";
            senderPrefix = isMine ? "Вы: " : "";
          } else {
            title = groupsById.get(item.chatId)?.name ?? "Группа";
            const senderName = isMine
              ? "Вы"
              : groupsById.get(item.chatId)?.members.find((m) => m.id === item.senderId)
                  ?.display_name ?? "Участник";
            senderPrefix = `${senderName}: `;
          }
          return (
            <Pressable style={styles.row} onPress={() => handlePressResult(item)}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.snippet} numberOfLines={2}>
                {senderPrefix}
                {item.body}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          query.trim() ? (
            <Text style={styles.empty}>Ничего не найдено</Text>
          ) : (
            <Text style={styles.empty}>Введите слово или фразу для поиска</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  input: {
    margin: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
  },
  title: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  snippet: { color: "#495057" },
  empty: { textAlign: "center", color: "#868e96", marginTop: 40 },
});
