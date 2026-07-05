export const ITEM_CATEGORIES = [
  "wallet",
  "phone",
  "keys",
  "bag",
  "electronics",
  "documents",
  "clothing",
  "accessories",
  "other",
] as const;

export const CONTACT_TYPES = [
  "phone",
  "line",
  "instagram",
  "facebook",
  "email",
] as const;

export const NER_FIELD_RULES = `กฎการสกัดข้อมูลสำหรับแจ้งของหาย/เจอ:
- itemName: ชื่อสิ่งของ (กระชับ)
- category: ต้องเป็นค่าใดค่าหนึ่ง — ${ITEM_CATEGORIES.join(", ")}
- description: สี ยี่ห้อ จุดเด่น (ถ้าไม่มีใช้ชื่อสิ่งของ)
- locationLost/locationFound: จุดเกิดเหตุที่ทำหายหรือเจอ (ไม่ใช่สถานที่ฝากของ)
- time/dateLost/dateFound: เวลาที่เกิดเหตุ (ถ้าไม่มีให้เว้นว่าง)
- contact + contactType: เฉพาะช่องทางติดต่อส่วนตัว (${CONTACT_TYPES.join(", ")}) — ห้ามใส่สถานที่
- dropOffLocation (เจอของ): สถานที่ฝากของ ถ้าไม่ระบุใช้ personnel_office`;

export const NER_NO_INVENT_RULE =
  "ห้ามเติมข้อมูลที่ผู้ใช้ไม่ได้บอก — ถ้าไม่แน่ใจให้ถามก่อน";

export function buildNerSchemaSection(): string {
  return NER_FIELD_RULES;
}

export function buildNerExamplesSection(): string {
  return `ตัวอย่าง:
Input: "หูฟังซัมซุงหายหน้าห้องสมุด บ่ายสามโมง มีป้ายชื่ออิม"
→ itemName: หูฟัง, category: electronics, description: ยี่ห้อซัมซุง มีป้ายชื่ออิม, locationLost: หน้าห้องสมุด, time: 15:00

Input: "เจอบัตรนักเรียนหน้าโรงอาหาร Line: somchai99"
→ description: บัตรนักเรียน, locationFound: หน้าโรงอาหาร, contact: somchai99, contactType: line`;
}
