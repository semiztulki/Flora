import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import { formatRemaining } from "../utils/formatRemaining";

export default function BannedScreen() {
  const { banInfo, clearBanInfo } = useAuth();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!banInfo) return null;

  const isPermanent = banInfo.expiresAt === null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Доступ ограничен</Text>
      <Text style={styles.reasonLabel}>Причина:</Text>
      <Text style={styles.reason}>{banInfo.reason}</Text>
      <Text style={styles.remainingLabel}>
        {isPermanent ? "Бан выдан навсегда" : "Осталось до конца бана:"}
      </Text>
      {!isPermanent && (
        <Text style={styles.remaining}>{formatRemaining(banInfo.expiresAt)}</Text>
      )}
      <Pressable style={styles.button} onPress={clearBanInfo}>
        <Text style={styles.buttonText}>Ко входу</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 24, color: "#c92a2a" },
  reasonLabel: { fontSize: 13, color: "#868e96", textTransform: "uppercase", marginBottom: 4 },
  reason: { fontSize: 16, marginBottom: 24 },
  remainingLabel: { fontSize: 13, color: "#868e96", textTransform: "uppercase", marginBottom: 4 },
  remaining: { fontSize: 20, fontWeight: "700", marginBottom: 32 },
  button: {
    backgroundColor: "#495057",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
