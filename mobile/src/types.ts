export type PresenceStatus = "online" | "away" | "dnd" | "invisible" | "offline";

/** Statuses a user can explicitly set for themselves (offline isn't one of them). */
export type SettableStatus = "online" | "away" | "dnd" | "invisible";

export interface User {
  id: number;
  uin: number;
  display_name: string;
  bio: string | null;
  status: PresenceStatus;
  last_seen: string;
  is_admin: boolean;
  // Only populated on rows from GET /contacts: whether *you've* let this
  // contact see through your invisible mode.
  visible_when_invisible?: boolean;
}

export interface BanInfo {
  reason: string;
  expiresAt: string | null;
}

export interface Ban {
  id: number;
  user_id: number;
  banned_by_id: number;
  reason: string;
  created_at: string;
  expires_at: string | null;
  lifted_at: string | null;
}

export interface AdminUserView {
  id: number;
  uin: number;
  display_name: string;
  bio: string | null;
  status: PresenceStatus;
  last_seen: string;
  is_admin: boolean;
  active_ban: Ban | null;
}

export type ReportCategory = "spam" | "scam" | "threats" | "illegal_content" | "other";

export interface ReportSubmitResult {
  id: number;
  reporter_id: number;
  reported_user_id: number;
  category: ReportCategory;
  comment: string | null;
  message_excerpt: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ReportAdminView {
  id: number;
  reporter_uin: number;
  reported_user_id: number;
  reported_uin: number;
  reported_display_name: string;
  category: ReportCategory;
  comment: string | null;
  message_excerpt: string | null;
  created_at: string;
  resolved_at: string | null;
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
  uin: number;
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
  uin: number;
  display_name: string;
  bio: string | null;
}

export interface ContactAddResult {
  relationship_status: "pending" | "accepted";
  contact: User;
}

export interface BlockedUser {
  id: number;
  uin: number;
  display_name: string;
}

export type ServerEvent =
  // `replay` marks a message resent from the offline backlog on reconnect,
  // rather than a live event — the client uses it to skip the incoming sound.
  | ({ type: "message"; replay?: boolean } & Message)
  | ({ type: "group_message"; replay?: boolean } & GroupMessage)
  | { type: "presence"; user_id: number; status: PresenceStatus; last_seen: string }
  | { type: "typing"; sender_id: number; recipient_id?: number; group_id?: number }
  | { type: "banned"; reason: string; expires_at: string | null }
  | { type: "contact_request"; id: number; uin: number; display_name: string }
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
  Search: undefined;
  Banned: undefined;
  Admin: undefined;
  Report: {
    reportedUin: number;
    reportedDisplayName: string;
    messageId?: number;
    groupMessageId?: number;
  };
};
