import { StatusBar } from "expo-status-bar";
import React from "react";

import DismissKeyboardView from "./src/components/DismissKeyboardView";
import { AuthProvider } from "./src/context/AuthContext";
import { SocketProvider } from "./src/context/SocketContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <StatusBar style="auto" />
        <DismissKeyboardView>
          <RootNavigator />
        </DismissKeyboardView>
      </SocketProvider>
    </AuthProvider>
  );
}
