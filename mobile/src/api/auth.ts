import { api } from "./client";
import { AuthResponse, User } from "../types";

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function register(
  username: string,
  displayName: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", {
    username,
    display_name: displayName,
    password,
  });
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", { username, password });
  return data;
}

export async function updateProfile(update: {
  displayName?: string;
  bio?: string;
}): Promise<User> {
  const { data } = await api.patch<User>("/auth/me", {
    display_name: update.displayName,
    bio: update.bio,
  });
  return data;
}
