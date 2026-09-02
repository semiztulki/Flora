import * as FileSystem from "expo-file-system/legacy";

import { SettableStatus } from "../types";

// Remembers the last note typed for each status type, purely on-device, so
// re-picking e.g. "away" prefills "за кофе, минут на десять" again instead
// of starting blank every time — she asked for this explicitly since typing
// the same note over and over is exactly the kind of friction old ICQ never
// had. Not synced anywhere; each device keeps its own.
const FILE_URI = `${FileSystem.documentDirectory}status_notes.json`;

async function readAll(): Promise<Partial<Record<SettableStatus, string>>> {
  try {
    const info = await FileSystem.getInfoAsync(FILE_URI);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(FILE_URI);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function getLastNote(status: SettableStatus): Promise<string> {
  const all = await readAll();
  return all[status] ?? "";
}

export async function setLastNote(status: SettableStatus, note: string): Promise<void> {
  const all = await readAll();
  if (note) {
    all[status] = note;
  } else {
    delete all[status];
  }
  await FileSystem.writeAsStringAsync(FILE_URI, JSON.stringify(all));
}
