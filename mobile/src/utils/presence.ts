import { PresenceStatus } from "../types";

export const statusColor: Record<PresenceStatus, string> = {
  available: "#2f9e44",
  free_for_chat: "#12b886",
  away: "#fab005",
  not_available: "#adb5bd",
  occupied: "#e8590c",
  dnd: "#f76707",
  offline: "#e03131",
};

export const statusLabel: Record<PresenceStatus, string> = {
  available: "Доступен",
  free_for_chat: "Свободен для общения",
  away: "Отошёл",
  not_available: "Недоступен",
  occupied: "Занят",
  dnd: "Не беспокоить",
  offline: "Не в сети",
};

// Invisible is a separate dimension layered on top of a mood, not a mood
// itself — this color/label is only ever shown for YOUR OWN indicator when
// invisible is on, or as a small badge next to your real status. Everyone
// else just sees "offline" (statusColor.offline) unless you've granted them
// visible_when_invisible. Classic ICQ gray — always was, no reinventing it.
export const INVISIBLE_COLOR = "#868e96";
export const INVISIBLE_LABEL = "Невидимый";
