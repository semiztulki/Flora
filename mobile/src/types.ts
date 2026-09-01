export type PresenceStatus = "online" | "away" | "offline";

export interface User {
  id: number;
  username: string;
  display_name: string;
  status: PresenceStatus;
  last_seen: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  client_id: string | null;
  created_at: string;
}

export type ServerEvent =
  | ({ type: "message" } & Message)
  | { type: "presence"; user_id: number; status: PresenceStatus; last_seen: string }
  | { type: "error"; detail: string }
  | { type: "pong" };

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Contacts: undefined;
  Chat: { contact: User };
};
