import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { SettableStatus } from "../types";
import { getLastNote, setLastNote } from "../utils/statusNotes";
import { INVISIBLE_COLOR, INVISIBLE_LABEL, statusColor, statusLabel } from "../utils/presence";

const STATUS_ORDER: SettableStatus[] = [
  "available",
  "free_for_chat",
  "away",
  "not_available",
  "occupied",
  "dnd",
];

const DURATION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Пока не изменю" },
  { value: 30, label: "30 минут" },
  { value: 60, label: "1 час" },
  { value: 240, label: "4 часа" },
];

const NOTE_MAX_LENGTH = 120;

export interface StatusUpdate {
  status: SettableStatus;
  invisible: boolean;
  note: string;
  durationMinutes: number | null;
}

export default function StatusPickerModal({
  visible,
  onClose,
  currentStatus,
  currentInvisible,
  currentNote,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  currentStatus: SettableStatus;
  currentInvisible: boolean;
  currentNote: string;
  onApply: (update: StatusUpdate) => void;
}) {
  const [pendingStatus, setPendingStatus] = useState<SettableStatus>(currentStatus);
  const [pendingInvisible, setPendingInvisible] = useState(currentInvisible);
  const [pendingNote, setPendingNote] = useState(currentNote);
  const [pendingDuration, setPendingDuration] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setPendingStatus(currentStatus);
      setPendingInvisible(currentInvisible);
      setPendingNote(currentNote);
      setPendingDuration(null);
    }
    // Only re-seed when the modal opens — the fields are meant to be freely
    // edited while it's open, not snapped back if currentStatus etc. changes
    // for some unrelated reason while it's up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handlePickMood = async (status: SettableStatus) => {
    setPendingStatus(status);
    setPendingNote(await getLastNote(status));
  };

  const handleApply = async () => {
    const note = pendingNote.trim();
    await setLastNote(pendingStatus, note);
    onApply({
      status: pendingStatus,
      invisible: pendingInvisible,
      note,
      durationMinutes: pendingDuration,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.sectionLabel}>Статус</Text>
          {STATUS_ORDER.map((status) => (
            <Pressable
              key={status}
              style={styles.moodRow}
              onPress={() => handlePickMood(status)}
            >
              <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
              <Text
                style={[styles.moodText, pendingStatus === status && styles.moodTextSelected]}
              >
                {statusLabel[status]}
              </Text>
              {pendingStatus === status && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}

          <View style={styles.divider} />

          <View style={styles.invisibleRow}>
            <View style={[styles.dot, { backgroundColor: INVISIBLE_COLOR }]} />
            <Text style={styles.moodText}>{INVISIBLE_LABEL}</Text>
            <View style={styles.spacer} />
            <Switch value={pendingInvisible} onValueChange={setPendingInvisible} />
          </View>

          <Text style={styles.sectionLabel}>Пояснение</Text>
          <TextInput
            style={styles.noteInput}
            value={pendingNote}
            onChangeText={setPendingNote}
            placeholder="Например: за кофе, минут на десять"
            maxLength={NOTE_MAX_LENGTH}
          />

          <Text style={styles.sectionLabel}>На сколько</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                style={[
                  styles.durationChip,
                  pendingDuration === option.value && styles.durationChipSelected,
                ]}
                onPress={() => setPendingDuration(option.value)}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    pendingDuration === option.value && styles.durationChipTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.saveButton} onPress={handleApply}>
            <Text style={styles.saveButtonText}>Сохранить</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: 300,
    maxHeight: "85%",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#868e96",
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 4,
  },
  moodRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  moodText: { fontSize: 15, color: "#212529" },
  moodTextSelected: { fontWeight: "700" },
  checkmark: { marginLeft: "auto", color: "#2f9e44", fontWeight: "700" },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  divider: { height: 1, backgroundColor: "#f1f3f5", marginTop: 8 },
  invisibleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  spacer: { flex: 1 },
  noteInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  durationChip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  durationChipSelected: { backgroundColor: "#2f9e44", borderColor: "#2f9e44" },
  durationChipText: { fontSize: 13, color: "#212529" },
  durationChipTextSelected: { color: "#fff", fontWeight: "600" },
  saveButton: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
