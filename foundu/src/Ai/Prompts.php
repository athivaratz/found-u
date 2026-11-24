<?php

declare(strict_types=1);

namespace Foundu\Ai;

// The prompts are the ones the TypeScript pipeline sent. Wording is part
// of the parse: the model is asked for those keys and nothing else.
final class Prompts
{
    public static function vision(): string
    {
        return <<<'TXT'
คุณเป็น AI วิเคราะห์รูปสิ่งของ (Found Item Vision)

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น

--- Schema ---
1. itemName (String): ชื่อสิ่งของสั้นๆ เช่น กระเป๋าสตางค์ โทรศัพท์ หูฟัง
2. category (String): ต้องเป็นหนึ่งใน wallet, phone, keys, bag, electronics, documents, clothing, accessories, other
3. color (String/null): สีหลักที่เห็น หรือ null
4. brand (String/null): ยี่ห้อที่เห็น หรือ null
5. details (String/null): รายละเอียดที่เห็น หรือ null
6. confidence (String): "low" | "medium" | "high"

--- กฎ ---
- ห้ามเดาสิ่งที่มองไม่เห็นในรูป
- ถ้าไม่ชัด ใช้ null หรือ "other"

ตัวอย่าง output:
{"itemName":"หูฟัง","category":"electronics","color":"ดำ","brand":null,"details":"ไร้สาย","confidence":"high"}
TXT;
    }

    public static function ner(string $text): string
    {
        $body = <<<'TXT'
คุณคือ AI สำหรับระบบ Lost & Found หน้าที่คือสกัดข้อมูลเป็น JSON ตามกฎอย่างเคร่งครัด

--- Rules & Schema ---
1. item (String): ชื่อสิ่งของ (กระชับ)
2. description (String/null): รายละเอียด, สี, ยี่ห้อ, จุดเด่น (ถ้าไม่มีใส่ null)
3. location (String/null): สถานที่ที่ "ทำหาย" หรือ "เจอล่าสุด" (จุดเกิดเหตุ)
4. time (String/null): เวลาที่เกิดเหตุ
5. contact (String/null): **เฉพาะช่องทางติดต่อสื่อสารส่วนบุคคลเท่านั้น** - ต้องเป็น: เบอร์โทร, Line ID, IG, Facebook, Email
   - ห้ามใส่: สถานที่ (เช่น "ห้องปกครอง", "โต๊ะครู"), หรือคำลอยๆ (เช่น "ทักแชท") -> ให้ไปใส่ใน remark หรือ null
6. contactType (String/null): ประเภทช่องทางติดต่อ - **ต้องเป็นค่าใดค่าหนึ่ง**: "phone", "line", "instagram", "facebook", "email"
   - เบอร์โทร/ตัวเลข 10 หลัก = "phone"
   - Line, ไลน์, @xxx = "line"
   - IG, Instagram, Insta = "instagram"
   - FB, Facebook, เฟสบุ๊ค = "facebook"
   - email, อีเมล, @xxx.com = "email"
   - ถ้าไม่ชัดเจนหรือไม่มี = null
7. category (String/null): ประเภทของที่หาย - **ต้องเป็นค่าใดค่าหนึ่ง**: "wallet", "phone", "keys", "bag", "electronics", "documents", "clothing", "accessories", "other"
   - กระเป๋าสตางค์, ตังค์, wallet = "wallet"
   - โทรศัพท์, มือถือ, iPhone, Samsung, phone = "phone"
   - กุญแจ, key, พวงกุญแจ = "keys"
   - กระเป๋า, เป้, bag = "bag"
   - iPad, แท็บเล็ต, laptop, นาฬิกาสมาร์ท, หูฟัง, AirPods = "electronics"
   - บัตรนักเรียน, บัตรประชาชน, เอกสาร = "documents"
   - เสื้อ, กางเกง, หมวก, ชุดพละ = "clothing"
   - แหวน, สร้อย, ต่างหู, นาฬิกา(ธรรมดา) = "accessories"
   - อื่นๆ ที่ไม่เข้าหมวดใด = "other"
8. remark (String/null): ข้อมูลเพิ่มเติมอื่นๆ หรือ **"สถานที่นัดรับ/ฝากของ"**
   - ตัวอย่าง: "เอามาฝากไว้ห้องปกครองรี1/11", "มีรางวัลให้คนเจอ", "ด่วนมาก"
9. target (String): "lost" หรือ "found"

ห้ามเติมข้อมูลที่ผู้ใช้ไม่ได้บอก — ถ้าไม่แน่ใจให้ถามก่อน

--- Examples ---
Input: "ตามหาพวงกุญแจซันซู หายตอนวันสอบธรรมะ น่าจะแถวสนามกีฬากับสหกรณ์ ใครเจอเอามาฝากห้องปกครองรี1/11(3604)หน่อย"
Output: {"item":"พวงกุญแจ","description":"ลายซันซู","location":"สนามกีฬากับสหกรณ์","time":"วันสอบธรรมะ","contact":null,"contactType":null,"category":"keys","remark":"ฝากไว้ที่ห้องปกครองรี1/11 (3604)","target":"lost"}

Input: "เจอบัตรนักเรียนตกอยู่หน้าโรงอาหาร ติดต่อรับคืนที่ Line: somchai99 หรือโทร 081-234-5678"
Output: {"item":"บัตรนักเรียน","description":null,"location":"หน้าโรงอาหาร","time":null,"contact":"somchai99, 081-234-5678","contactType":"line","category":"documents","remark":null,"target":"found"}

Input: "ลืมกระเป๋าตังสีดำ มีเงิน 500 ใครเจอทักแชทมาหน่อย หรือเอาไปไว้ป้อมยามก็ได้"
Output: {"item":"กระเป๋าสตางค์","description":"สีดำ, มีเงิน 500 บาท","location":null,"time":null,"contact":null,"contactType":null,"category":"wallet","remark":"ให้ทักแชท หรือนำไปฝากที่ป้อมยาม","target":"lost"}

Input: "หูฟังสีดำ หายที่ใต้ตึก3 ติดต่อ IG: athivaratz, 0661234567 ฝากไว้ที่ห้องธุรการ"
Output: {"item":"หูฟัง","description":"สีดำ","location":"ใต้ตึก3","time":null,"contact":"athivaratz, 0661234567","contactType":"instagram","category":"electronics","remark":"ฝากไว้ที่ห้องธุรการ","target":"lost"}

---
Input Text: "{text}"
JSON Output:
TXT;
        return str_replace('{text}', $text, $body);
    }

    public static function match(array $lost, array $found): string
    {
        $body = <<<'TXT'
คุณเป็น AI สำหรับจับคู่ของหายกับของที่เจอ

เปรียบเทียบรายการ "ของหาย" กับ "ของเจอ" แล้วให้คะแนนความตรงกัน (0.0-1.0)
- score >= 0.7 และ isMatch: true เมื่อมั่นใจว่าน่าจะเป็นคู่กัน
- ห้ามเดาข้อมูลที่ไม่มีในรายการ

ของหาย:
- ชื่อ: {lostItem}
- รายละเอียด: {lostDesc}
- สถานที่หาย: {lostLocation}

ของเจอ:
- รายละเอียด: {foundDesc}
- สถานที่เจอ: {foundLocation}

ตอบเป็น JSON เท่านั้น:
{
  "score": 0.0-1.0,
  "reasons": ["เหตุผล1", "เหตุผล2"],
  "isMatch": true/false
}

ตัวอย่าง: หูฟังซัมซุงหายหน้าห้องสมุด vs เจอหูฟังสีดำหน้าห้องสมุด → score 0.85, isMatch: true
TXT;
        return strtr($body, [
            '{lostItem}' => (string) ($lost['itemName'] ?? ''),
            '{lostDesc}' => (($lost['description'] ?? '') !== '' && $lost['description'] !== null) ? (string) $lost['description'] : 'ไม่มี',
            '{lostLocation}' => (string) ($lost['locationLost'] ?? ''),
            '{foundDesc}' => (string) ($found['description'] ?? ''),
            '{foundLocation}' => (string) ($found['locationFound'] ?? ''),
        ]);
    }
}
