export type PresenceStatus = "online" | "away" | "dnd" | "invisible" | "offline";

/** Statuses a user can explicitly set for themselves (offline isn't one of them). */
export type SettableStatus = "online" | "away" | "dnd" | "invisible";

export interface User {
  id: number;
  username: string;
  display_name: string;
  bio: string | null;
  status: PresenceStatus;
  last_seen: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Attachment {
  id: number;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  attachment: Attachment | null;
  client_id: string | null;
  created_at: string;
}

export interface GroupMember {
  id: number;
  username: string;
  display_name: string;
}

export interface Group {
  id: number;
  name: string;
  owner_id: number;
  created_at: string;
  members: GroupMember[];
}

export interface GroupMessage {
  id: number;
  group_id: number;
  sender_id: number;
  body: string;
  attachment: Attachment | null;
  client_id: string | null;
  created_at: string;
}

export interface ContactRequest {
  id: number;
  username: string;
  display_name: string;
  bio: string | null;
}

export interface ContactAddResult {
  relationship_status: "pending" | "accepted";
  contact: User;
}

export interface BlockedUser {
  id: number;
  username: string;
  display_name: string;
}

export type ServerEvent =
  | ({ type: "message" } & Message)
  | ({ type: "group_message" } & GroupMessage)
  | { type: "presence"; user_id: number; status: PresenceStatus; last_seen: string }
  | { type: "typing"; sender_id: number; recipient_id?: number; group_id?: number }
  | { type: "error"; detail: string }
  | { type: "pong" };

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Contacts: undefined;
  Chat: { contact: User };
  GroupChat: { group: Group };
  CreateGroup: undefined;
  Profile: undefined;
};
