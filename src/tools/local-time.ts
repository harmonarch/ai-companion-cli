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
      iso: now.toISOString(),
      epochMs: now.getTime(),
      timezone,
      utcOffsetMinutes,
      localeString: now.toString(),
    };
  },
};