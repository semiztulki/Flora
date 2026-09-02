// Six classic-ICQ "moods" plus `offline` (never user-settable — it's what
// gets broadcast when there's no live connection at all). Invisible is
// deliberately NOT in this list: it's a separate boolean (User.invisible)
// layered on top of whichever mood is active, not a mood itself.
export type PresenceStatus =
  | "available"
  | "free_for_chat"
  | "away"
  | "not_available"
  | "occupied"
  | "dnd"
  | "offline";

/** Moods a user can explicitly set for themselves (offline isn't one of them). */
export type SettableStatus = Exclude<PresenceStatus, "offline">;

export interface Attachment {
  id: number;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface User {
  id: number;
  uin: number;
  display_name: string;
  avatar: Attachment | null;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  birthday: string | null; // "YYYY-MM-DD"
  birthday_show_year: boolean;
  city: string | null;
  country: string | null;
  // Comma-separated — rendered as chips client-side.
  languages: string | null;
  occupation: string | null;
  interests: string | null;
  about: string | null;
  website: string | null;
  email: string | null;
  email_public: boolean;
  phone: string | null;
  phone_public: boolean;
  status: PresenceStatus;
  invisible: boolean;
  status_note: string | null;
  status_expires_at: string | null;
  last_seen: string;
  is_admin: boolean;
  // Only populated on rows from GET /contacts: whether *you've* let this
  // contact see through your invisible mode, and your own private label
  // for them (never visible to them or anyone else).
  visible_when_invisible?: boolean;
  local_nickname?: string | null;
}

/** The subset of a user's fields a chat screen actually needs — lets both a
 * full contacts-list User and a slimmer PublicProfile navigate to Chat. */
export type ChatPeer = Pick<User, "id" | "uin" | "display_name" | "status" | "avatar">;

/** Someone else's profile, the way GET /profiles/{uin} is allowed to show it
 * to you — status/status_note already masked for their invisible mode. */
export interface PublicProfile {
  id: number;
  uin: number;
  display_name: string;
  avatar: Attachment | null;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  birthday: string | null;
  birthday_show_year: boolean;
  city: string | null;
  country: string | null;
  languages: string | null;
  occupation: string | null;
  interests: string | null;
  about: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  status: PresenceStatus;
  status_note: string | null;
  last_seen: string;
  // Your own private label for them, if you've set one — not theirs.
  local_nickname: string | null;
  is_contact: boolean;
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
  | {
      type: "presence";
      user_id: number;
      status: PresenceStatus;
      note: string | null;
      last_seen: string;
    }
  | { type: "typing"; sender_id: number; recipient_id?: number; group_id?: number }
  | { type: "banned"; reason: string; expires_at: string | null }
  | { type: "contact_request"; id: number; uin: number; display_name: string }
  | { type: "error"; detail: string }
  | { type: "pong" };

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Contacts: undefined;
  Chat: { contact: ChatPeer };
  GroupChat: { group: Group };
  CreateGroup: undefined;
  Profile: undefined;
  PublicProfile: { uin: number };
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
