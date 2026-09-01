import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as adminApi from "../api/admin";
import * as reportsApi from "../api/reports";
import { AdminUserView, ReportAdminView, ReportCategory } from "../types";
import { formatRemaining } from "../utils/formatRemaining";

const DURATION_PRESETS: { label: string; minutes: number | null }[] = [
  { label: "1 час", minutes: 60 },
  { label: "1 день", minutes: 60 * 24 },
  { label: "3 дня", minutes: 60 * 24 * 3 },
  { label: "7 дней", minutes: 60 * 24 * 7 },
  { label: "30 дней", minutes: 60 * 24 * 30 },
  { label: "Навсегда", minutes: null },
];

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: "Спам",
  scam: "Мошенничество",
  threats: "Угрозы / насилие",
  illegal_content: "Незаконный контент",
  other: "Другое",
};

export default function AdminScreen() {
  const [reports, setReports] = useState<ReportAdminView[]>([]);
  const [username, setUsername] = useState("");
  const [target, setTarget] = useState<AdminUserView | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadReports = useCallback(() => {
    reportsApi.fetchOpenReports().then(setReports);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const handleLookup = useCallback(async (forUsername?: string) => {
    const name = (forUsername ?? username).trim();
    if (!name) return;
    setError(null);
    setIsLoading(true);
    try {
      const found = await adminApi.lookupUser(name);
      setTarget(found);
      setUsername(name);
      setReason("");
    } catch (e: any) {
      setTarget(null);
      setError(e?.response?.data?.detail ?? "Пользователь не найден");
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  const handleBan = async (minutes: number | null) => {
    if (!target || !reason.trim()) return;
    setError(null);
    setIsLoading(true);
    try {
      const updated = await adminApi.banUser(target.id, minutes, reason.trim());
      setTarget(updated);
      setReason("");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось забанить");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnban = async () => {
    if (!target) return;
    setError(null);
    setIsLoading(true);
    try {
      const updated = await adminApi.unbanUser(target.id);
      setTarget(updated);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось разбанить");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveReport = async (report: ReportAdminView) => {
    await reportsApi.resolveReport(report.id);
    setReports((prev) => prev.filter((r) => r.id !== report.id));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {reports.length > 0 && (
        <>
          <Text style={styles.label}>Открытые жалобы ({reports.length})</Text>
          {reports.map((report) => (
            <View key={report.id} style={styles.reportCard}>
              <Text style={styles.reportHeader}>
                {report.reporter_username} → {report.reported_display_name} (@
                {report.reported_username})
              </Text>
              <Text style={styles.reportCategory}>{CATEGORY_LABELS[report.category]}</Text>
              {report.message_excerpt && (
                <Text style={styles.reportExcerpt} numberOfLines={3}>
                  «{report.message_excerpt}»
                </Text>
              )}
              {report.comment && <Text style={styles.reportComment}>{report.comment}</Text>}
              <View style={styles.reportActions}>
                <Pressable
                  style={styles.reportActionButton}
                  onPress={() => handleLookup(report.reported_username)}
                >
                  <Text style={styles.reportActionButtonText}>Открыть в модерации</Text>
                </Pressable>
                <Pressable
                  style={[styles.reportActionButton, styles.resolveButton]}
                  onPress={() => handleResolveReport(report)}
                >
                  <Text style={styles.reportActionButtonText}>Закрыть жалобу</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.label}>Логин пользователя</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="username"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <Pressable
          style={styles.searchButton}
          onPress={() => handleLookup()}
          disabled={!username.trim()}
        >
          <Text style={styles.searchButtonText}>Найти</Text>
        </Pressable>
      </View>

      {isLoading && <ActivityIndicator style={styles.spinner} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {target && (
        <View style={styles.card}>
          <Text style={styles.name}>{target.display_name}</Text>
          <Text style={styles.username}>@{target.username}</Text>

          {target.active_ban ? (
            <View style={styles.banBox}>
              <Text style={styles.banLabel}>В бане</Text>
              <Text style={styles.banReason}>{target.active_ban.reason}</Text>
              <Text style={styles.banRemaining}>
                {target.active_ban.expires_at
                  ? `Осталось: ${formatRemaining(target.active_ban.expires_at)}`
                  : "Забанен навсегда"}
              </Text>
              <Pressable style={styles.unbanButton} onPress={handleUnban}>
                <Text style={styles.unbanButtonText}>Разбанить</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.banForm}>
              <TextInput
                style={styles.reasonInput}
                placeholder="Причина бана"
                value={reason}
                onChangeText={setReason}
                multiline
              />
              <View style={styles.presetRow}>
                {DURATION_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.label}
                    style={[styles.presetButton, !reason.trim() && styles.presetButtonDisabled]}
                    onPress={() => handleBan(preset.minutes)}
                    disabled={!reason.trim()}
                  >
                    <Text style={styles.presetButtonText}>{preset.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#868e96", textTransform: "uppercase", marginBottom: 8 },
  reportCard: {
    borderWidth: 1,
    borderColor: "#ffe3e3",
    backgroundColor: "#fff5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  reportHeader: { fontWeight: "700", marginBottom: 2 },
  reportCategory: { color: "#c92a2a", fontWeight: "600", marginBottom: 4 },
  reportExcerpt: { fontStyle: "italic", color: "#495057", marginBottom: 4 },
  reportComment: { color: "#495057", marginBottom: 8 },
  reportActions: { flexDirection: "row", gap: 8 },
  reportActionButton: {
    backgroundColor: "#495057",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  resolveButton: { backgroundColor: "#2f9e44" },
  reportActionButtonText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  searchRow: { flexDirection: "row", marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
  },
  searchButton: {
    backgroundColor: "#495057",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  searchButtonText: { color: "#fff", fontWeight: "600" },
  spinner: { marginTop: 16 },
  error: { color: "#c92a2a", marginTop: 8 },
  card: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#f1f3f5",
    borderRadius: 12,
    padding: 16,
  },
  name: { fontSize: 18, fontWeight: "700" },
  username: { color: "#868e96", marginBottom: 12 },
  banBox: { backgroundColor: "#fff5f5", borderRadius: 8, padding: 12 },
  banLabel: { fontWeight: "700", color: "#c92a2a", marginBottom: 4 },
  banReason: { marginBottom: 4 },
  banRemaining: { color: "#495057", marginBottom: 12 },
  unbanButton: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  unbanButtonText: { color: "#fff", fontWeight: "600" },
  banForm: { marginTop: 4 },
  reasonInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    minHeight: 60,
    textAlignVertical: "top",
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetButton: {
    backgroundColor: "#c92a2a",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  presetButtonDisabled: { opacity: 0.4 },
  presetButtonText: { color: "#fff", fontWeight: "600" },
});
