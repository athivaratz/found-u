import { z } from "zod";
import { ITEM_CATEGORIES, CONTACT_TYPES } from "@/lib/agent/ner-field-hints";

const categoryDescribe = `Category enum: ${ITEM_CATEGORIES.join(", ")}`;

export const searchItemsToolSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("Search text: item name and location; location must match for results"),
  type: z.enum(["lost", "found", "all"]).optional().default("lost"),
  category: z.string().optional(),
  status: z
    .enum(["searching", "pending_room_confirm", "found", "claimed", "expired"])
    .optional(),
  limit: z.number().int().min(1).max(10).optional().default(10),
});

export const lookupTrackingCodeToolSchema = z.object({
  trackingCode: z
    .string()
    .min(3)
    .max(32)
    .describe("Tracking code e.g. LOST-XXXXXX or FOUND-XXXXXX"),
});

export const analyzeImageToolSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  prompt: z.string().max(500).optional(),
});

export const findMatchesToolSchema = z.object({
  type: z.enum(["lost", "found"]),
  itemId: z.string().min(1).describe("Database item id owned by the current user"),
  useAI: z.boolean().optional().default(false),
});

export const getUserItemsToolSchema = z.object({
  limit: z.number().int().min(1).max(10).optional().default(5),
});

const contactSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  value: z.string().min(1),
});

export const reportLostItemToolSchema = z.object({
  itemName: z.string().min(1).max(200).describe("Lost item name"),
  category: z.string().min(1).max(64).describe(categoryDescribe),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("Details: color, brand, distinguishing marks"),
  locationLost: z
    .string()
    .min(1)
    .max(500)
    .describe("Where the item was lost (incident location)"),
  dateLost: z.string().max(64).optional().describe("Date lost ISO or text"),
  time: z.string().max(64).optional().describe("Time lost e.g. 15:00"),
  contact: z.string().max(200).optional().describe("Contact value"),
  contactType: z.enum(CONTACT_TYPES).optional(),
  contacts: z.array(contactSchema).max(5).optional(),
});

export const reportFoundItemToolSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(2000)
    .describe("Description of the found item"),
  locationFound: z
    .string()
    .min(1)
    .max(500)
    .describe("Where the item was found (incident location)"),
  itemName: z.string().max(200).optional().describe("Item name"),
  category: z.string().max(64).optional().describe(categoryDescribe),
  color: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  dateFound: z.string().max(64).optional(),
  time: z.string().max(64).optional(),
  dropOffLocation: z
    .string()
    .max(64)
    .optional()
    .describe("Drop-off location e.g. personnel_office"),
  contact: z.string().max(200).optional(),
  contactType: z.enum(CONTACT_TYPES).optional(),
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
