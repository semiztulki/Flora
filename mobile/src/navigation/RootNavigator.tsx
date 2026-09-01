import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import AdminScreen from "../screens/AdminScreen";
import BannedScreen from "../screens/BannedScreen";
import ChatScreen from "../screens/ChatScreen";
import ContactsScreen from "../screens/ContactsScreen";
import CreateGroupScreen from "../screens/CreateGroupScreen";
import GroupChatScreen from "../screens/GroupChatScreen";
import LoginScreen from "../screens/LoginScreen";
import ProfileScreen from "../screens/ProfileScreen";
import RegisterScreen from "../screens/RegisterScreen";
import SearchScreen from "../screens/SearchScreen";
import { RootStackParamList } from "../types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { token, isLoading, banInfo } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {token ? (
          <>
            <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: "Flora" }} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="GroupChat" component={GroupChatScreen} />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ title: "Новая группа" }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: "Профиль" }}
            />
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={{ title: "Поиск" }}
            />
            <Stack.Screen
              name="Admin"
              component={AdminScreen}
              options={{ title: "Модерация" }}
            />
          </>
        ) : banInfo ? (
          <Stack.Screen name="Banned" component={BannedScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
