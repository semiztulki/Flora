import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export interface ContextMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface ContextMenuSection {
  title?: string;
  items: ContextMenuItem[];
}

/** A grouped, sectioned action sheet — the mobile equivalent of classic
 * ICQ's right-click context menu (which was always organized into labelled
 * groups like "Launch" / "User"), used in place of the OS-native Alert.alert
 * wherever that grouping matters, since Alert can't be styled or sectioned. */
export default function ContextMenu({
  visible,
  onClose,
  title,
  sections,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  sections: ContextMenuSection[];
}) {
  const handlePress = (item: ContextMenuItem) => {
    onClose();
    item.onPress();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title && (
            <View style={styles.titleBar}>
              <Text style={styles.titleText}>{title}</Text>
            </View>
          )}
          {sections.map((section, si) => (
            <View key={si} style={styles.section}>
              {section.title && <Text style={styles.sectionLabel}>{section.title}</Text>}
              {section.items.map((item) => (
                <Pressable
                  key={item.label}
                  style={styles.row}
                  onPress={() => handlePress(item)}
                >
                  <Text style={[styles.rowText, item.destructive && styles.rowTextDestructive]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
          <Pressable style={styles.cancelRow} onPress={onClose}>
            <Text style={styles.cancelText}>Отмена</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    overflow: "hidden",
  },
  titleBar: {
    backgroundColor: "#eaf7ea",
    borderBottomWidth: 1,
    borderBottomColor: "#c8e6c9",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  titleText: { fontWeight: "700", fontSize: 15, color: "#1e7a33" },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f3f5",
    paddingVertical: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#868e96",
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  row: { paddingVertical: 12, paddingHorizontal: 16 },
  rowText: { fontSize: 16, color: "#212529" },
  rowTextDestructive: { color: "#c92a2a" },
  cancelRow: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelText: { fontSize: 16, fontWeight: "600", color: "#868e96" },
});
