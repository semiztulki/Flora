import { PresenceStatus } from "../types";

export const statusColor: Record<PresenceStatus, string> = {
  online: "#2f9e44",
  away: "#fab005",
  dnd: "#f76707",
  // Classic ICQ gray. Only ever shown to you (your own status) or to a
  // contact you've specifically let see through invisible mode — everyone
  // else is shown "offline" (red) instead, never this color.
  invisible: "#868e96",
  offline: "#e03131",
};

export const statusLabel: Record<PresenceStatus, string> = {
  online: "В сети",
  away: "Отошёл",
  dnd: "Не беспокоить",
  invisible: "Невидимка",
  offline: "Не в сети",
};
