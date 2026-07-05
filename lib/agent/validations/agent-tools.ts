import { z } from "zod";

export const searchItemsToolSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["lost", "found", "all"]).optional().default("all"),
  category: z.string().optional(),
  status: z
    .enum(["searching", "pending_room_confirm", "found", "claimed", "expired"])
    .optional(),
  limit: z.number().int().min(1).max(10).optional().default(10),
});

export const lookupTrackingCodeToolSchema = z.object({
  trackingCode: z.string().min(3).max(32),
});

export const extractItemInfoToolSchema = z.object({
  text: z.string().min(1).max(4000),
  target: z.enum(["lost", "found"]),
});

export const analyzeImageToolSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  prompt: z.string().max(500).optional(),
});

export const findMatchesToolSchema = z.object({
  type: z.enum(["lost", "found"]),
  itemId: z.string().min(1),
  useAI: z.boolean().optional().default(false),
});

export const getUserItemsToolSchema = z.object({
  limit: z.number().int().min(1).max(10).optional().default(5),
});

const contactSchema = z.object({
  type: z.enum(["phone", "line", "instagram", "facebook", "email"]),
  value: z.string().min(1),
});

export const reportLostItemToolSchema = z.object({
  itemName: z.string().min(1).max(200),
  category: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  locationLost: z.string().min(1).max(500),
  dateLost: z.string().max(64).optional(),
  time: z.string().max(64).optional(),
  contact: z.string().max(200).optional(),
  contactType: z
    .enum(["phone", "line", "instagram", "facebook", "email"])
    .optional(),
  contacts: z.array(contactSchema).max(5).optional(),
});

export const reportFoundItemToolSchema = z.object({
  description: z.string().min(1).max(2000),
  locationFound: z.string().min(1).max(500),
  itemName: z.string().max(200).optional(),
  category: z.string().max(64).optional(),
  color: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  dateFound: z.string().max(64).optional(),
  time: z.string().max(64).optional(),
  dropOffLocation: z.string().max(64).optional(),
  contact: z.string().max(200).optional(),
  contactType: z
    .enum(["phone", "line", "instagram", "facebook", "email"])
    .optional(),
  finderContacts: z.array(contactSchema).max(5).optional(),
});

export type AgentToolResultType =
  | "items"
  | "tracking"
  | "match"
  | "ner"
  | "vision"
  | "report";

export interface AgentToolEnvelope<T = unknown> {
  ok: boolean;
  resultType: AgentToolResultType;
  data: T;
  message?: string;
}
