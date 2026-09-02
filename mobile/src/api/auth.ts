import { api } from "./client";
import { AuthResponse, User } from "../types";

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function register(displayName: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", {
    display_name: displayName,
    password,
  });
  return data;
}

export async function login(uin: number, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", { uin, password });
  return data;
}

// Patch-style, same convention as the backend: a field left `undefined` here
// is omitted from the request entirely (left untouched server-side); pass ""
// (or, for birthday, null) to explicitly clear a field.
export interface ProfileUpdateInput {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  pronouns?: string;
  birthday?: string | null; // "YYYY-MM-DD"
  birthdayShowYear?: boolean;
  city?: string;
  country?: string;
  languages?: string;
  occupation?: string;
  interests?: string;
  about?: string;
  website?: string;
  email?: string;
  emailPublic?: boolean;
  phone?: string;
  phonePublic?: boolean;
}

export async function updateProfile(update: ProfileUpdateInput): Promise<User> {
  const payload: Record<string, unknown> = {};
  if (update.displayName !== undefined) payload.display_name = update.displayName;
  if (update.firstName !== undefined) payload.first_name = update.firstName;
  if (update.lastName !== undefined) payload.last_name = update.lastName;
  if (update.pronouns !== undefined) payload.pronouns = update.pronouns;
  if (update.birthday !== undefined) payload.birthday = update.birthday || null;
  if (update.birthdayShowYear !== undefined) payload.birthday_show_year = update.birthdayShowYear;
  if (update.city !== undefined) payload.city = update.city;
  if (update.country !== undefined) payload.country = update.country;
  if (update.languages !== undefined) payload.languages = update.languages;
  if (update.occupation !== undefined) payload.occupation = update.occupation;
  if (update.interests !== undefined) payload.interests = update.interests;
  if (update.about !== undefined) payload.about = update.about;
  if (update.website !== undefined) payload.website = update.website;
  if (update.email !== undefined) payload.email = update.email;
  if (update.emailPublic !== undefined) payload.email_public = update.emailPublic;
  if (update.phone !== undefined) payload.phone = update.phone;
  if (update.phonePublic !== undefined) payload.phone_public = update.phonePublic;

  const { data } = await api.patch<User>("/auth/me", payload);
  return data;
}

export async function updateAvatar(attachmentId: number | null): Promise<User> {
  const { data } = await api.patch<User>("/auth/me/avatar", { attachment_id: attachmentId });
  return data;
}
