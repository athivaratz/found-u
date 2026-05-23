#!/usr/bin/env bun
/**
 * Generate test student CSV for Found-U school login
 * Usage: bun run scripts/generate-students-csv.ts --count 30 --output students-test.csv
 */

import { writeFileSync } from "fs";
import { randomBytes } from "crypto";

const FIRST_NAMES = ["สมชาย", "สมหญิง", "วิชัย", "พิมพ์", "อรุณ", "นารี", "ธนา", "มานี", "กิตติ", "สุดา"];
const LAST_NAMES = ["ใจดี", "รักเรียน", "มั่นคง", "สดใส", "เก่งกาจ", "ยิ้มแย้ม", "ขยัน", "สุภาพ", "กล้าหาญ", "อดทน"];
const NICKNAMES = ["ชาย", "หญิง", "วิช", "พิม", "อรุณ", "นารี", "ธน", "มาน", "กิต", "สุ"];

function randomPassword(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 10;
  let output = "students-test.csv";
  let startId = 10001;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) count = parseInt(args[i + 1], 10);
    if (args[i] === "--output" && args[i + 1]) output = args[i + 1];
    if (args[i] === "--start-id" && args[i + 1]) startId = parseInt(args[i + 1], 10);
  }

  return { count, output, startId };
}

const { count, output, startId } = parseArgs();
const lines: string[] = ["# studentId:password:firstName:lastName:nickname"];

console.log("\nGenerated credentials:\n");
console.log("studentId | password   | name");
console.log("----------|------------|-----");

for (let i = 0; i < count; i++) {
  const studentId = String(startId + i).padStart(5, "0");
  const password = randomPassword(7 + (i % 2));
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastName = LAST_NAMES[i % LAST_NAMES.length];
  const nickname = NICKNAMES[i % NICKNAMES.length];
  lines.push(`${studentId}:${password}:${firstName}:${lastName}:${nickname}`);
  console.log(`${studentId}  | ${password} | ${firstName} ${lastName} (${nickname})`);
}

writeFileSync(output, lines.join("\n") + "\n", "utf8");
console.log(`\nWrote ${count} rows to ${output}\n`);
