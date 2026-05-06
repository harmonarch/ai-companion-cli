import path from "node:path";
import { z } from "zod";

export const assistantProfileRelativePath = path.join("assistant-profile", "assistant-profile.json");

export const assistantProfileSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  selfReference: z.string().trim().min(1).optional(),
  persona: z.string().trim().min(1).optional(),
  meta: z.object({
    updatedAt: z.string().datetime({ offset: true }),
    updatedBy: z.string().trim().min(1),
  }),
}).refine(
  (value) => Boolean(value.name || value.role || value.selfReference || value.persona),
  { message: "Assistant profile must include at least one identity field." },
);

export type AssistantProfile = z.infer<typeof assistantProfileSchema>;

export const assistantProfileFields = ["name", "role", "selfReference", "persona"] as const;

export type AssistantProfileField = typeof assistantProfileFields[number];

