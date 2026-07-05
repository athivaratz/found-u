import type { ZodError } from "zod";

const FIELD_LABELS_TH: Record<string, string> = {
  itemName: "ชื่อสิ่งของ",
  category: "หมวดหมู่",
  description: "รายละเอียด",
  locationLost: "สถานที่ที่ทำหาย",
  locationFound: "สถานที่ที่เจอ",
  contacts: "ช่องทางติดต่อ",
  finderContacts: "ช่องทางติดต่อ",
  trackingCode: "รหัสติดตาม",
};

export function formatReportValidationError(error: ZodError): {
  message: string;
  missingFields: string[];
} {
  const missingFields = [
    ...new Set(
      error.issues.map((issue) => {
        const key = String(issue.path[0] ?? "");
        return FIELD_LABELS_TH[key] || key;
      })
    ),
  ];

  if (missingFields.length === 1) {
    return {
      message: `ขาด${missingFields[0]} กรุณาระบุให้ครบแล้วลองใหม่`,
      missingFields,
    };
  }

  if (missingFields.length > 1) {
    return {
      message: `ข้อมูลไม่ครบ: ${missingFields.join(", ")} กรุณาเพิ่มรายละเอียด`,
      missingFields,
    };
  }

  return {
    message: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่",
    missingFields,
  };
}
