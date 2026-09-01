import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import * as reportsApi from "../api/reports";
import { ReportCategory, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Report">;

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "spam", label: "Спам" },
  { value: "scam", label: "Мошенничество" },
  { value: "threats", label: "Угрозы / насилие" },
  { value: "illegal_content", label: "Незаконный контент" },
  { value: "other", label: "Другое" },
];

export default function ReportScreen({ route, navigation }: Props) {
  const { reportedUsername, reportedDisplayName, messageId, groupMessageId } = route.params;
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!category) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await reportsApi.submitReport({
        reportedUsername,
        category,
        comment: comment.trim() || undefined,
        messageId,
        groupMessageId,
      });
      Alert.alert("Жалоба отправлена", "Спасибо, мы посмотрим.", [
        { text: "Ок", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось отправить жалобу");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Жалоба на {reportedDisplayName}</Text>

      <Text style={styles.label}>Причина</Text>
      <View style={styles.categoryList}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.categoryButton, category === c.value && styles.categoryButtonActive]}
            onPress={() => setCategory(c.value)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                category === c.value && styles.categoryButtonTextActive,
              ]}
            >
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Комментарий (необязательно)</Text>
      <TextInput
        style={styles.commentInput}
        placeholder="Что произошло?"
        value={comment}
        onChangeText={setComment}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={!category || isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Отправить жалобу</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  subtitle: { fontSize: 16, fontWeight: "600", marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "700", color: "#868e96", textTransform: "uppercase", marginBottom: 8 },
  categoryList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  categoryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  categoryButtonActive: { backgroundColor: "#c92a2a", borderColor: "#c92a2a" },
  categoryButtonText: { color: "#212529" },
  categoryButtonTextActive: { color: "#fff", fontWeight: "600" },
  commentInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  error: { color: "#c92a2a", marginBottom: 12 },
  submitButton: {
    backgroundColor: "#c92a2a",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
