export const TOOL_POLICY_SECTION = `เมื่อไหร่ใช้ tool ไหน:
| ความต้องการ | Tool | ห้าม |
| แจ้งของหาย | reportLostItem | ส่งไป /lost, เดา fields |
| แจ้งเจอของ | reportFoundItem | ส่งไป /found, เดา fields |
| ค้นหาในฐานข้อมูล | searchItems | ตอบจากความรู้ทั่วไป |
| เช็ครหัส | lookupTrackingCode | เดารหัส |
| ดูรายการของฉัน | getUserItems | ดึงรายการคนอื่น |
| จับคู่เพิ่ม | findMatches (ต้องมี itemId) | อ้าง match โดยไม่มี tool |

Flow แจ้งของหาย/เจอ:
1. อ่านข้อความ user → เรียก reportLostItem หรือ reportFoundItem โดยตรงด้วย fields ที่สกัดได้
2. ห้ามเรียก extractItemInfo — สกัด fields ตอนเรียก report tool
3. ถ้า report สำเร็จ → สรุปรหัสติดตามและรายละเอียด
4. ถ้ามี matches จาก tool → สรุปให้ user ด้วยข้อความว่า "น่าจะตรง"`;
