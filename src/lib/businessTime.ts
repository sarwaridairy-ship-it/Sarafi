export function businessDateInTimeZone(
  date: Date = new Date(),
  timeZone = "Asia/Kabul",
): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (value.year && value.month && value.day)
      return `${value.year}-${value.month}-${value.day}`;
  } catch {
    // Invalid legacy timezone values fall back to the browser's local calendar.
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
