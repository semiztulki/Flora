import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { LocalAttachment } from "../db/messages";
import { getLocalAttachmentUri } from "../utils/attachmentCache";

export default function AttachmentImage({
  attachment,
  onPress,
}: {
  attachment: LocalAttachment;
  onPress: (uri: string) => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setFailed(false);
    getLocalAttachmentUri(attachment.id, attachment.contentType)
      .then((localUri) => {
        if (!cancelled) setUri(localUri);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.contentType]);

  const aspectRatio = attachment.width && attachment.height ? attachment.width / attachment.height : 1;

  if (failed) {
    return (
      <View style={[styles.placeholder, { aspectRatio }]}>
        <Text style={styles.failedText}>Не удалось загрузить изображение</Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={[styles.placeholder, { aspectRatio }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Pressable onPress={() => onPress(uri)}>
      <Image source={{ uri }} style={[styles.image, { aspectRatio }]} resizeMode="cover" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { width: 220, borderRadius: 8 },
  placeholder: {
    width: 220,
    borderRadius: 8,
    backgroundColor: "#e9ecef",
    alignItems: "center",
    justifyContent: "center",
  },
  failedText: { color: "#868e96", fontSize: 12, padding: 8, textAlign: "center" },
});
