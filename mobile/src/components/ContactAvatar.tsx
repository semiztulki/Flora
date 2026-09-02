import React, { useEffect, useState } from "react";
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { getLocalAttachmentUri } from "../utils/attachmentCache";
import { Attachment } from "../types";

/** Classic-ICQ-style buddy icon: a square with slightly rounded corners —
 * never a circle, that's a WhatsApp/Telegram convention, not an ICQ one.
 * Presence is deliberately NOT shown here (no corner badge) — in old ICQ
 * the status is its own icon next to the nickname, separate from the buddy
 * icon entirely. Falls back to an initial letter when there's no avatar. */
export default function ContactAvatar({
  avatar,
  label,
  size = 40,
  style,
}: {
  avatar: Attachment | null;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!avatar) {
      setUri(null);
      return;
    }
    let cancelled = false;
    getLocalAttachmentUri(avatar.id, avatar.content_type)
      .then((u) => !cancelled && setUri(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [avatar]);

  const dim = { width: size, height: size, borderRadius: Math.max(4, size * 0.18) };

  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image source={{ uri }} style={dim} />
      ) : (
        <View style={[dim, styles.placeholder]}>
          <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
            {label.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: "#e9ecef", alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "700", color: "#868e96" },
});
