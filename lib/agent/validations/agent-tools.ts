import { z } from "zod";
import { ITEM_CATEGORIES, CONTACT_TYPES } from "@/lib/agent/ner-field-hints";

const categoryDescribe = `หมวดหมู่: ${ITEM_CATEGORIES.join(", ")}`;

export const searchItemsToolSchema = z.object({
  query: z.string().min(1).max(200).describe("คำค้น: ชื่อของ สถานที่ หรือรหัส"),
  type: z.enum(["lost", "found", "all"]).optional().default("all"),
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
    .describe("รหัสติดตาม เช่น LOST-XXXXXX หรือ FOUND-XXXXXX"),
});

export const analyzeImageToolSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  prompt: z.string().max(500).optional(),
});

export const findMatchesToolSchema = z.object({
  type: z.enum(["lost", "found"]),
  itemId: z.string().min(1).describe("รหัสรายการในฐานข้อมูล"),
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
  itemName: z.string().min(1).max(200).describe("ชื่อสิ่งของที่หาย"),
  category: z.string().min(1).max(64).describe(categoryDescribe),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("รายละเอียด สี ยี่ห้อ จุดเด่น"),
  locationLost: z
    .string()
    .min(1)
    .max(500)
    .describe("สถานที่ที่ทำหาย (จุดเกิดเหตุ)"),
  dateLost: z.string().max(64).optional().describe("วันที่หาย ISO หรือข้อความ"),
  time: z.string().max(64).optional().describe("เวลาที่หาย เช่น 15:00"),
  contact: z.string().max(200).optional().describe("ช่องทางติดต่อ"),
  contactType: z.enum(CONTACT_TYPES).optional(),
  contacts: z.array(contactSchema).max(5).optional(),
});

export const reportFoundItemToolSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(2000)
    .describe("รายละเอียดสิ่งของที่เจอ"),
  locationFound: z
    .string()
    .min(1)
    .max(500)
    .describe("สถานที่ที่เจอ (จุดเกิดเหตุ)"),
  itemName: z.string().max(200).optional().describe("ชื่อสิ่งของ"),
  category: z.string().max(64).optional().describe(categoryDescribe),
  color: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  dateFound: z.string().max(64).optional(),
  time: z.string().max(64).optional(),
  dropOffLocation: z
    .string()
    .max(64)
    .optional()
    .describe("สถานที่ฝากของ เช่น personnel_office"),
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
