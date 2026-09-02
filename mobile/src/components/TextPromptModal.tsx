import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// Alert.prompt is iOS-only in React Native — this is the cross-platform
// stand-in wherever we need a single text field in a dialog (e.g. renaming
// a contact for yourself).
export default function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel = "Сохранить",
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            autoFocus
            maxLength={64}
          />
          <View style={styles.buttonRow}>
            <Pressable style={styles.button} onPress={onCancel}>
              <Text style={styles.buttonText}>Отмена</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => onConfirm(value.trim())}>
              <Text style={[styles.buttonText, styles.confirmText]}>{confirmLabel}</Text>
            </Pressable>
          </View>
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
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, width: 280 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  buttonRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 20 },
  button: { paddingVertical: 4 },
  buttonText: { fontSize: 15, color: "#868e96" },
  confirmText: { color: "#2f9e44", fontWeight: "700" },
});
