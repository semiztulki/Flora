export function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "навсегда";

  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "истекает…";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days} дн.`);
  if (hours) parts.push(`${hours} ч.`);
  if (minutes || parts.length === 0) parts.push(`${minutes} мин.`);
  return parts.join(" ");
}
