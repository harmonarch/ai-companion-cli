const sameDayTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const olderMessageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatChatMessageTimestamp(value: string, now = new Date()) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "--:--";
  }

  const isSameDay = timestamp.getFullYear() === now.getFullYear()
    && timestamp.getMonth() === now.getMonth()
    && timestamp.getDate() === now.getDate();

  return isSameDay
    ? sameDayTimeFormatter.format(timestamp)
    : olderMessageTimeFormatter.format(timestamp);
}
