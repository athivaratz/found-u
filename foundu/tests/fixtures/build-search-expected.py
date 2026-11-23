#!/usr/bin/env python3
"""Reference pg_trgm ranking for the P8 search fixture.

MariaDB 10.11 has no ngram full-text parser. The PHP search copies the
Postgres function in supabase/migrations/20260705125243_trgm_fuzzy_search.sql:
character trigrams padded with two spaces on the left and one on the right,
Jaccard similarity, threshold 0.15, tracking-code prefix when the query
starts with LOST- or FOUND-. This script is the expected side of that port.
"""

from __future__ import annotations

import json
from pathlib import Path


def trigrams(value: str) -> set[str]:
    chars = list(value or "")
    padded = [" ", " "] + chars + [" "]
    return {"".join(padded[i : i + 3]) for i in range(len(padded) - 2)}


def similarity(left: str, right: str) -> float:
    a = trigrams(left)
    b = trigrams(right)
    if not a or not b:
        return 0.0
    shared = len(a & b)
    return shared / (len(a) + len(b) - shared)


def rank(items: list[dict], query: str, threshold: float, limit: int) -> list[str]:
    needle = query.strip()
    prefix = needle.upper().startswith("LOST-") or needle.upper().startswith("FOUND-")
    scored = []
    for item in items:
        name = item.get("item_name") or ""
        desc = item.get("description") or ""
        loc = item.get("location") or ""
        code = item.get("tracking_code") or ""
        score = max(similarity(name, needle), similarity(desc, needle), similarity(loc, needle))
        code_hit = needle.lower() in code.lower() if needle else False
        code_prefix = code.upper().startswith(needle.upper()) if needle else False
        if prefix:
            if not code_prefix:
                continue
            group = 0
        else:
            if needle and score < threshold and not code_hit:
                continue
            group = 0 if code_prefix and needle.upper().startswith(("LOST-", "FOUND-")) else 1
        scored.append((group, -score, item["created_at"], item["id"]))
    # group ASC, score DESC, created_at DESC, id ASC.
    scored.sort(key=lambda row: (row[0], row[1], tuple(-ord(ch) for ch in row[2]), row[3]))
    return [row[3] for row in scored[:limit]]


ITEMS = [
    ("01", "หูฟังสีดำ", "ไร้สาย ยี่ห้อซัมซุง", "หน้าห้องสมุด", "LOST-EAR001", "2026-11-01 10:00:00.000", "electronics"),
    ("02", "หูฟัง", "สีขาว มีสาย", "โรงอาหาร", "LOST-EAR002", "2026-11-02 10:00:00.000", "electronics"),
    ("03", "หูฟังบลูทูธ", "กล่องสีเทา", "ตึก 3", "LOST-EAR003", "2026-11-03 10:00:00.000", "electronics"),
    ("04", "เคสหูฟัง", "ซิลิโคนสีชมพู", "ห้องสมุด", "LOST-EAR004", "2026-11-04 10:00:00.000", "accessories"),
    ("05", "ลำโพงบลูทูธ", "ขนาดเล็ก", "สนามกีฬา", "LOST-SPK001", "2026-11-05 10:00:00.000", "electronics"),
    ("06", "กระเป๋าสตางค์สีดำ", "มีบัตรนักเรียน", "โรงอาหาร", "LOST-WAL001", "2026-10-01 09:00:00.000", "wallet"),
    ("07", "กระเป๋าสตางค์", "สีน้ำตาล", "หน้าสหกรณ์", "LOST-WAL002", "2026-10-02 09:00:00.000", "wallet"),
    ("08", "กระเป๋าเป้", "สีกรมท่า", "ลานจอดรถ", "LOST-BAG001", "2026-10-03 09:00:00.000", "bag"),
    ("09", "กระเป๋าผ้า", "ลายทาง", "ห้องเรียน 4/2", "LOST-BAG002", "2026-10-04 09:00:00.000", "bag"),
    ("10", "พวงกุญแจรถ", "รีโมทสีดำ", "สนามกีฬา", "LOST-KEY001", "2026-09-01 08:00:00.000", "keys"),
    ("11", "กุญแจหอพัก", "พวงกุญแจหมี", "หอพัก", "LOST-KEY002", "2026-09-02 08:00:00.000", "keys"),
    ("12", "ลูกกุญแจ", "ดอกเดียว", "ห้องน้ำตึก 2", "LOST-KEY003", "2026-09-03 08:00:00.000", "keys"),
    ("13", "บัตรนักเรียน", "ชั้น ม.4", "หน้าโรงอาหาร", "LOST-DOC001", "2026-08-01 08:00:00.000", "documents"),
    ("14", "บัตรประชาชน", "หุ้มพลาสติก", "ห้องธุรการ", "LOST-DOC002", "2026-08-02 08:00:00.000", "documents"),
    ("15", "iPhone 13", "สีดำ เคสใส", "ห้องสมุด", "LOST-PHN001", "2026-07-01 08:00:00.000", "phone"),
    ("16", "โทรศัพท์ซัมซุง", "จอแตกมุม", "โรงอาหาร", "LOST-PHN002", "2026-07-02 08:00:00.000", "phone"),
    ("17", "นาฬิกาข้อมือ", "สายหนังสีน้ำตาล", "สนามกีฬา", "LOST-WAT001", "2026-06-01 08:00:00.000", "accessories"),
    ("18", "ร่มพับ", "สีน้ำเงิน", "ป้อมยาม", "LOST-UMB001", "2026-06-02 08:00:00.000", "clothing"),
    ("19", "สายชาร์จไอโฟน", "ยาว 1 เมตร", "ห้องเรียน", "LOST-CHG001", "2026-05-01 08:00:00.000", "electronics"),
    ("20", "แว่นตา", "กรอบดำ", "ห้องสมุด", "LOST-GLS001", "2026-05-02 08:00:00.000", "accessories"),
    ("21", "รองเท้าผ้าใบ", "เบอร์ 42 สีขาว", "สนามกีฬา", "LOST-SHO001", "2026-04-01 08:00:00.000", "clothing"),
    ("22", "ปากกา", "หมึกสีน้ำเงิน", "ห้องเรียน 5/1", "LOST-PEN001", "2026-04-02 08:00:00.000", "other"),
    ("23", "สมุดจด", "ปกน้ำตาล", "ห้องสมุด", "LOST-NTB001", "2026-04-03 08:00:00.000", "documents"),
    ("24", "หมวกแก๊ป", "สีกรม", "สนามกีฬา", "LOST-HAT001", "2026-04-04 08:00:00.000", "clothing"),
    ("25", "เงินสด", "แบงก์ร้อยสองใบ", "โรงอาหาร", "LOST-CSH001", "2026-04-05 08:00:00.000", "other"),
]

QUERIES = [
    "หูฟัง",
    "หูฟังสีดำ",
    "กระเป๋าสตางค์",
    "กระเป๋า",
    "กุญแจ",
    "บัตรนักเรียน",
    "โรงอาหาร",
    "ห้องสมุด",
    "iphone",
    "นาฬิกา",
    "ร่ม",
    "สายชาร์จ",
    "LOST-EAR00",
    "แว่นตา",
    "รองเท้า",
    "ปากกา",
    "สมุด",
    "หมวก",
    "เงิน",
    "ซัมซุง",
]


def main() -> None:
    items = []
    for suffix, name, desc, loc, code, created, cat in ITEMS:
        items.append(
            {
                "id": f"00000000-0000-4000-8000-0000000000{suffix}",
                "item_name": name,
                "description": desc,
                "location": loc,
                "tracking_code": code,
                "created_at": created,
                "category": cat,
                "status": "searching",
            }
        )
    queries = []
    for query in QUERIES:
        expected = rank(items, query, 0.15, 5)
        queries.append({"q": query, "expected": expected})
        print(query, expected)
    out = {
        "method": "pg_trgm character trigrams, Jaccard, threshold 0.15, top 5",
        "threshold": 0.15,
        "limit": 5,
        "items": items,
        "queries": queries,
    }
    path = Path(__file__).with_name("search-expected.json")
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", path)


if __name__ == "__main__":
    main()
