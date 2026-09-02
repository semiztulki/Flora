import React, { useEffect, useState } from "react";
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { getLocalAttachmentUri } from "../utils/attachmentCache";
import { Attachment } from "../types";

/** A small round avatar with a status-color dot badge in the corner — used
 * anywhere a contact needs to be both recognizable and show live presence
 * at a glance (contacts list, chat header, …). Falls back to an initial
 * letter when there's no avatar set. */
export default function ContactAvatar({
  avatar,
  label,
  statusColor,
  size = 40,
  style,
}: {
  avatar: Attachment | null;
  label: string;
  statusColor?: string;
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

  const dim = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      {uri ? (
        <Image source={{ uri }} style={dim} />
      ) : (
        <View style={[dim, styles.placeholder]}>
          <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
            {label.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      {statusColor && (
        <View
          style={[
            styles.statusDot,
            { backgroundColor: statusColor, width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  placeholder: { backgroundColor: "#e9ecef", alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "700", color: "#868e96" },
  statusDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    borderWidth: 2,
    borderColor: "#fff",
  },
});
