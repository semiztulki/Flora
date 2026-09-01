import React from "react";
import { Keyboard, StyleSheet, TouchableWithoutFeedback, View } from "react-native";

/** Wraps the whole app so tapping anywhere outside a focused input closes the
 * keyboard, instead of requiring every screen to wire this up itself. */
export default function DismissKeyboardView({ children }: { children: React.ReactNode }) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.fill}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
