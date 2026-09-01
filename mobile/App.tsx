import { StatusBar } from "expo-status-bar";
import React from "react";

import { AuthProvider } from "./src/context/AuthContext";
import { SocketProvider } from "./src/context/SocketContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </SocketProvider>
    </AuthProvider>
  );
}
