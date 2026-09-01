import * as Crypto from "expo-crypto";

export function generateClientId(): string {
  return Crypto.randomUUID();
}
