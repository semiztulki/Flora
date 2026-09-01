import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

export const API_URL = (extra.apiUrl as string) ?? "http://localhost:8000";
export const WS_URL = (extra.wsUrl as string) ?? "ws://localhost:8000";
