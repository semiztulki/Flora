import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim(), bio: bio.trim() });
      navigation.goBack();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Имя</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

      <Text style={styles.label}>О себе</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        value={bio}
        onChangeText={setBio}
        placeholder="Пара слов о себе"
        multiline
        maxLength={200}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={styles.button}
        onPress={handleSave}
        disabled={isSaving || !displayName.trim()}
      >
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  label: { fontSize: 13, fontWeight: "700", color: "#868e96", textTransform: "uppercase", marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
  },
  bioInput: { minHeight: 80, textAlignVertical: "top" },
  error: { color: "#c92a2a", marginTop: 12, textAlign: "center" },
  button: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
