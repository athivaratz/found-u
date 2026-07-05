import { tool } from "ai";
import { extractVisionData } from "@/lib/vision";
import {
  findMatchesForFoundItem,
  findMatchesForLostItem,
  findMatchesForFoundItemAI,
  findMatchesForLostItemAI,
  getMatchConfidence,
} from "@/lib/matching";
import {
  getFoundItemByIdServer,
  getLostItemByIdServer,
  getLostItemByTrackingCodeServer,
  getUserFoundItemsServer,
  getUserLostItemsServer,
  searchItemsServer,
} from "@/lib/agent/item-queries-server";
import {
  reportFoundItemServer,
  reportLostItemServer,
} from "@/lib/agent/item-actions-server";
import {
  serializeFoundItem,
  serializeLostItem,
} from "@/lib/agent/row-mappers";
import type { AppSettings } from "@/lib/types";
import {
  analyzeImageToolSchema,
  findMatchesToolSchema,
  getUserItemsToolSchema,
  lookupTrackingCodeToolSchema,
  reportFoundItemToolSchema,
  reportLostItemToolSchema,
  searchItemsToolSchema,
  type AgentToolEnvelope,
} from "@/lib/agent/validations/agent-tools";

export function createAgentTools(options: {
  userId: string | null;
  settings: AppSettings;
}) {
  const { userId, settings } = options;

  return {
    searchItems: tool({
      description:
        "ค้นหารายการของหายหรือของเจอในฐานข้อมูล — ต้องเรียกก่อนตอบว่ามีรายการหรือไม่ ห้ามเดาจากความรู้ทั่วไป",
      inputSchema: searchItemsToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        try {
          const { lost, found } = await searchItemsServer({
            query: input.query,
            type: input.type,
            category: input.category,
            status: input.status,
            limit: input.limit,
          });
          return {
            ok: true,
            resultType: "items",
            data: {
              lost: lost.map(serializeLostItem),
              found: found.map(serializeFoundItem),
              total: lost.length + found.length,
            },
          };
        } catch (error) {
          console.error("[searchItems]", error);
          return {
            ok: false,
            resultType: "items",
            data: { lost: [], found: [], total: 0 },
            message: "ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง",
          };
        }
      },
    }),

    lookupTrackingCode: tool({
      description:
        "ค้นหารายการจากรหัสติดตาม — ต้องเรียกก่อนยืนยันรหัส ห้ามเดารหัส",
      inputSchema: lookupTrackingCodeToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        try {
          const item = await getLostItemByTrackingCodeServer(input.trackingCode);
          return {
            ok: Boolean(item),
            resultType: "tracking",
            data: item ? serializeLostItem(item) : null,
            message: item ? undefined : "ไม่พบรหัสติดตามนี้",
          };
        } catch (error) {
          console.error("[lookupTrackingCode]", error);
          return {
            ok: false,
            resultType: "tracking",
            data: null,
            message: "ค้นหารหัสไม่สำเร็จ ลองใหม่อีกครั้ง",
          };
        }
      },
    }),

    analyzeImage: tool({
      description:
        "วิเคราะห์รูปภาพสิ่งของเพื่อระบุชื่อ หมวดหมู่ สี ยี่ห้อ — ใช้เมื่อมีรูปภาพ",
      inputSchema: analyzeImageToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        try {
          let base64 = input.imageBase64;
          let mimeType = "image/jpeg";

          if (input.imageUrl?.startsWith("data:")) {
            const match = input.imageUrl.match(/^data:(.+);base64,(.*)$/);
            if (match) {
              mimeType = match[1];
              base64 = match[2];
            }
          } else if (input.imageUrl) {
            const res = await fetch(input.imageUrl);
            if (!res.ok) {
              return {
                ok: false,
                resultType: "vision",
                data: null,
                message: "โหลดรูปภาพไม่สำเร็จ",
              };
            }
            const buf = await res.arrayBuffer();
            base64 = Buffer.from(buf).toString("base64");
            mimeType = res.headers.get("content-type") || mimeType;
          }

          if (!base64) {
            return {
              ok: false,
              resultType: "vision",
              data: null,
              message: "ต้องระบุ imageUrl หรือ imageBase64",
            };
          }

          const result = await extractVisionData(base64, mimeType, {
            model: settings.aiVisionModel,
            temperature: settings.aiVisionTemperature,
            topP: settings.aiVisionTopP,
            maxOutputTokens: settings.aiVisionMaxOutputTokens,
          });
          const data =
            result && typeof result === "object" && "data" in result
              ? (result as { data: unknown }).data
              : result;
          return {
            ok: Boolean(data),
            resultType: "vision",
            data: data ?? null,
          };
        } catch (error) {
          console.error("[analyzeImage]", error);
          return {
            ok: false,
            resultType: "vision",
            data: null,
            message: "วิเคราะห์รูปไม่สำเร็จ",
          };
        }
      },
    }),

    findMatches: tool({
      description:
        "จับคู่รายการของหายกับของเจอตาม item id — ใช้หลังมีรายการแล้วเท่านั้น",
      inputSchema: findMatchesToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        try {
          const aiConfig = {
            model: settings.aiMatchingModel,
            temperature: settings.aiMatchingTemperature,
            topP: settings.aiMatchingTopP,
            maxOutputTokens: settings.aiMatchingMaxOutputTokens,
          };

          if (input.type === "lost") {
            const lostItem = await getLostItemByIdServer(input.itemId);
            if (!lostItem) {
              return {
                ok: false,
                resultType: "match",
                data: [],
                message: "ไม่พบรายการของหาย",
              };
            }
            const { found } = await searchItemsServer({
              query: lostItem.itemName || lostItem.description || "",
              type: "found",
              limit: 10,
            });
            const matches = input.useAI
              ? await findMatchesForLostItemAI(lostItem, found, 5, aiConfig)
              : findMatchesForLostItem(lostItem, found);
            return {
              ok: true,
              resultType: "match",
              data: matches.map((m) => ({
                score: m.score,
                confidence: getMatchConfidence(m.score),
                scorePercentage: Math.round(m.score * 100),
                reasons: m.reasons,
                lostItem: serializeLostItem(m.lostItem),
                foundItem: serializeFoundItem(m.foundItem),
              })),
            };
          }

          const foundItem = await getFoundItemByIdServer(input.itemId);
          if (!foundItem) {
            return {
              ok: false,
              resultType: "match",
              data: [],
              message: "ไม่พบรายการของเจอ",
            };
          }
          const { lost } = await searchItemsServer({
            query: foundItem.itemName || foundItem.description || "",
            type: "lost",
            limit: 10,
          });
          const matches = input.useAI
            ? await findMatchesForFoundItemAI(foundItem, lost, 5, aiConfig)
            : findMatchesForFoundItem(foundItem, lost);
          return {
            ok: true,
            resultType: "match",
            data: matches.map((m) => ({
              score: m.score,
              confidence: getMatchConfidence(m.score),
              scorePercentage: Math.round(m.score * 100),
              reasons: m.reasons,
              lostItem: serializeLostItem(m.lostItem),
              foundItem: serializeFoundItem(m.foundItem),
            })),
          };
        } catch (error) {
          console.error("[findMatches]", error);
          return {
            ok: false,
            resultType: "match",
            data: [],
            message: "จับคู่ไม่สำเร็จ ลองใหม่อีกครั้ง",
          };
        }
      },
    }),

    getUserItems: tool({
      description:
        "ดึงรายการของหายและของเจอที่ผู้ใช้ปัจจุบันแจ้งไว้ — ใช้เมื่อ user ถามเรื่องรายการของตัวเอง",
      inputSchema: getUserItemsToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        if (!userId) {
          return {
            ok: false,
            resultType: "items",
            data: { lost: [], found: [], total: 0 },
            message: "ต้องเข้าสู่ระบบก่อน",
          };
        }
        try {
          const [lostItems, foundItems] = await Promise.all([
            getUserLostItemsServer(userId, input.limit),
            getUserFoundItemsServer(userId, input.limit),
          ]);
          return {
            ok: true,
            resultType: "items",
            data: {
              lost: lostItems.map(serializeLostItem),
              found: foundItems.map(serializeFoundItem),
              total: lostItems.length + foundItems.length,
            },
          };
        } catch (error) {
          console.error("[getUserItems]", error);
          return {
            ok: false,
            resultType: "items",
            data: { lost: [], found: [], total: 0 },
            message: "ดึงรายการไม่สำเร็จ",
          };
        }
      },
    }),

    reportLostItem: tool({
      description:
        "แจ้งของหายลงระบบทันที — สกัด fields จากข้อความ user แล้วเรียก tool นี้โดยตรง (ห้ามใช้ extractItemInfo)",
      inputSchema: reportLostItemToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        if (!userId) {
          return {
            ok: false,
            resultType: "report",
            data: null,
            message: "ต้องเข้าสู่ระบบก่อนแจ้งของหาย",
          };
        }
        try {
          const { item, matches } = await reportLostItemServer({
            userId,
            ...input,
          });
          return {
            ok: true,
            resultType: "report",
            data: {
              type: "lost" as const,
              item: serializeLostItem(item),
              matches,
            },
          };
        } catch (error) {
          console.error("[reportLostItem]", error);
          return {
            ok: false,
            resultType: "report",
            data: null,
            message: "บันทึกรายการไม่สำเร็จ กรุณาตรวจสอบชื่อของและสถานที่แล้วลองใหม่",
          };
        }
      },
    }),

    reportFoundItem: tool({
      description:
        "แจ้งเจอของลงระบบทันที — สกัด fields จากข้อความ user แล้วเรียก tool นี้โดยตรง (ห้ามใช้ extractItemInfo)",
      inputSchema: reportFoundItemToolSchema,
      execute: async (input): Promise<AgentToolEnvelope> => {
        if (!userId) {
          return {
            ok: false,
            resultType: "report",
            data: null,
            message: "ต้องเข้าสู่ระบบก่อนแจ้งเจอของ",
          };
        }
        try {
          const { item, matches } = await reportFoundItemServer(
            { userId, ...input },
            settings
          );
          return {
            ok: true,
            resultType: "report",
            data: {
              type: "found" as const,
              item: serializeFoundItem(item),
              matches,
            },
          };
        } catch (error) {
          console.error("[reportFoundItem]", error);
          return {
            ok: false,
            resultType: "report",
            data: null,
            message: "บันทึกรายการไม่สำเร็จ กรุณาตรวจสอบรายละเอียดและสถานที่แล้วลองใหม่",
          };
        }
      },
    }),
  };
}

export type FoundUAgentTools = ReturnType<typeof createAgentTools>;
