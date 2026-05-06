 import { z } from "zod";

export const localTimeToolDefinition = {
  name: "local_time",
  description: "Get the current local date, time, and timezone of this machine.",
  riskLevel: "low" as const,
  schema: z.object({}),
  summarize() {
    return "Get local machine time";
  },
  async execute() {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const utcOffsetMinutes = -now.getTimezoneOffset();

    return {
      localIso: formatLocalIso(now),
      epochMs: now.getTime(),
      timezone,
      utcOffsetMinutes,
      localeString: now.toString(),
    };
  },
};

function formatLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffsetMinutes / 60));
  const offsetRemainderMinutes = pad(absoluteOffsetMinutes % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
