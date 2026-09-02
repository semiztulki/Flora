import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as contactsApi from "../api/contacts";
import * as profilesApi from "../api/profiles";
import { getLocalAttachmentUri } from "../utils/attachmentCache";
import { PublicProfile, RootStackParamList } from "../types";
import { statusColor, statusLabel } from "../utils/presence";

type Props = NativeStackScreenProps<RootStackParamList, "PublicProfile">;

function fullName(profile: PublicProfile): string | null {
  const parts = [profile.first_name, profile.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function cityCountry(profile: PublicProfile): string | null {
  const parts = [profile.city, profile.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function chips(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function PublicProfileScreen({ route, navigation }: Props) {
  const { uin } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    profilesApi
      .fetchPublicProfile(uin)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        navigation.setOptions({ title: p.local_nickname || p.display_name });
        if (p.avatar) {
          getLocalAttachmentUri(p.avatar.id, p.avatar.content_type)
            .then((uri) => !cancelled && setAvatarUri(uri))
            .catch(() => {});
        }
      })
      .catch((e) => setError(e?.response?.data?.detail ?? "Не удалось загрузить профиль"));
    return () => {
      cancelled = true;
    };
  }, [uin, navigation]);

  const handleAddContact = async () => {
    if (!profile) return;
    setIsAdding(true);
    try {
      const result = await contactsApi.addContact(profile.uin);
      Alert.alert(
        result.relationship_status === "accepted" ? "Добавлено" : "Заявка отправлена",
        result.relationship_status === "accepted"
          ? `${profile.display_name} теперь в ваших контактах.`
          : `Заявка отправлена пользователю ${profile.display_name}.`
      );
    } catch (e: any) {
      Alert.alert("Не удалось добавить контакт", e?.response?.data?.detail ?? "Попробуйте ещё раз");
    } finally {
      setIsAdding(false);
    }
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const name = fullName(profile);
  const place = cityCountry(profile);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {(profile.local_nickname || profile.display_name).charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.nickname}>{profile.local_nickname || profile.display_name}</Text>
        {profile.local_nickname && <Text style={styles.realNickname}>{profile.display_name}</Text>}
        <Text style={styles.uin}>№ {profile.uin}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor[profile.status] }]} />
          <Text style={styles.statusText}>
            {statusLabel[profile.status]}
            {profile.status_note ? ` · ${profile.status_note}` : ""}
          </Text>
        </View>
      </View>

      {name && <Text style={styles.realName}>{name}</Text>}
      {place && <Text style={styles.place}>{place}</Text>}

      {profile.about && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>О себе</Text>
          <Text style={styles.sectionText}>{profile.about}</Text>
        </View>
      )}

      {chips(profile.interests).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Интересы</Text>
          <View style={styles.chipRow}>
            {chips(profile.interests).map((tag) => (
              <View key={tag} style={styles.chip}>
                <Text style={styles.chipText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {chips(profile.languages).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Языки</Text>
          <View style={styles.chipRow}>
            {chips(profile.languages).map((tag) => (
              <View key={tag} style={styles.chip}>
                <Text style={styles.chipText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {profile.occupation && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Занятие</Text>
          <Text style={styles.sectionText}>{profile.occupation}</Text>
        </View>
      )}

      {profile.website && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Сайт</Text>
          <Text style={styles.sectionText}>{profile.website}</Text>
        </View>
      )}

      {profile.email && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Email</Text>
          <Text style={styles.sectionText}>{profile.email}</Text>
        </View>
      )}

      {profile.phone && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Телефон</Text>
          <Text style={styles.sectionText}>{profile.phone}</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, styles.messageButton]}
          onPress={() => navigation.navigate("Chat", { contact: profile })}
        >
          <Text style={styles.buttonText}>Написать</Text>
        </Pressable>
        {!profile.is_contact && (
          <Pressable
            style={[styles.button, styles.addButton]}
            onPress={handleAddContact}
            disabled={isAdding}
          >
            {isAdding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Добавить контакт</Text>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#c92a2a" },
  header: { alignItems: "center", marginBottom: 16 },
  // Square with slightly rounded corners — classic ICQ buddy icon, not a
  // WhatsApp/Telegram-style circle.
  avatar: { width: 96, height: 96, borderRadius: 14, marginBottom: 12 },
  avatarPlaceholder: { backgroundColor: "#e9ecef", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 36, fontWeight: "700", color: "#868e96" },
  nickname: { fontSize: 22, fontWeight: "700" },
  realNickname: { fontSize: 13, color: "#868e96", marginTop: 2 },
  uin: { fontSize: 14, color: "#868e96", marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  statusText: { fontSize: 14, color: "#495057" },
  realName: { fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 2 },
  place: { fontSize: 14, color: "#868e96", textAlign: "center", marginBottom: 12 },
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#868e96",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionText: { fontSize: 15, color: "#212529" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#f1f3f5", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: "#495057" },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  messageButton: { backgroundColor: "#2f9e44" },
  addButton: { backgroundColor: "#5c7cfa" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
