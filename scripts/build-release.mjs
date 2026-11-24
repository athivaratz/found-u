#!/usr/bin/env node
// Builds the DirectAdmin zip: static Next export plus the PHP app.
// Run this on a machine with Node and Composer. The host has neither.

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const stage = path.join(dist, "stage");
const zipPath = path.join(dist, "foundu-release.zip");

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name, path.join(from, entry.name))) continue;
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(path.join(from, entry.name), dest, skip);
    } else if (entry.isSymbolicLink()) {
      continue;
    } else {
      fs.copyFileSync(path.join(from, entry.name), dest);
    }
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function inlineHashes(dir) {
  const hashes = new Set();
  const scriptRe = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const file of walk(dir)) {
    if (!file.endsWith(".html")) continue;
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(scriptRe)) {
      const body = match[1];
      if (!body || !body.trim()) continue;
      const digest = createHash("sha256").update(body, "utf8").digest("base64");
      hashes.add(`'sha256-${digest}'`);
    }
  }
  return [...hashes];
}

function r2Origin() {
  const raw = process.env.R2_PUBLIC_BASE_URL || "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function patchHtaccess(file) {
  let text = fs.readFileSync(file, "utf8");
  const origin = r2Origin();
  if (origin) {
    text = text.replace(
      "img-src 'self' data: blob:",
      `img-src 'self' data: blob: ${origin}`
    );
    if (!text.includes(origin)) {
      throw new Error("could not add the R2 origin to img-src");
    }
  }
  text = text.replace(/ 'sha256-[^']+'/g, "");
  const hashes = inlineHashes(path.dirname(file));
  if (hashes.length > 0) {
    text = text.replace(
      "script-src 'self' https://challenges.cloudflare.com",
      `script-src 'self' https://challenges.cloudflare.com ${hashes.join(" ")}`
    );
  }
  fs.writeFileSync(file, text);
}

const readme = `Found-U release
อัปโหลดผ่าน DirectAdmin File Manager

English
1. In DirectAdmin, open File Manager and go to your home directory (the folder that contains public_html).
2. Upload foundu-release.zip there and click Extract.
3. You should see public_html/ (the site) and foundu/ (the PHP app, next to public_html, not inside it).
4. In File Manager open foundu/install-token.txt (this folder sits next to public_html, not inside it). Copy the whole line. That file is the one-time setup token.
5. In a browser open https://your-domain/install and paste the token. Follow the five steps. The installer writes foundu/config/.env.php with mode 600, imports the database in short slices, and creates the first admin.
6. The last step shows the cron line and a link to /cloudflare-checklist.html. After that, /install answers 404 and the token file is deleted. Copy the cron line before you close the page.
7. In DirectAdmin, add that cron. Then follow the Cloudflare checklist and purge the cache.

ไทย
1. เปิด File Manager ใน DirectAdmin ไปที่โฟลเดอร์บ้าน (โฟลเดอร์ที่มี public_html)
2. อัปโหลด foundu-release.zip แล้วกด Extract
3. ต้องได้ public_html/ (เว็บ) กับ foundu/ (แอป PHP อยู่ข้าง public_html ไม่ใช่ข้างใน)
4. ใน File Manager เปิด foundu/install-token.txt แล้วคัดลอกทั้งบรรทัด นี่คือโทเค็นใช้ครั้งเดียว
5. เปิดเบราว์เซอร์ไปที่ https://โดเมนของคุณ/install วางโทเค็น แล้วทำ 5 ขั้น ตัวติดตั้งจะเขียน foundu/config/.env.php สิทธิ์ 600 นำเข้าฐานข้อมูลทีละช่วง และสร้างผู้ดูแลคนแรก
6. ขั้นสุดท้ายแสดงคำสั่ง cron กับลิงก์รายการตรวจ Cloudflare จากนั้น /install จะขึ้น 404 และไฟล์โทเค็นถูกลบ คัดลอกคำสั่ง cron ก่อนปิดหน้า
7. ใส่ cron ใน DirectAdmin แล้วทำรายการ Cloudflare จากนั้นล้างแคช

ทางสำรอง ถ้าหน้าติดตั้งใช้ไม่ได้: ก็อป foundu/config/.env.php.example เป็น foundu/config/.env.php แล้วตั้งสิทธิ์ 600 นำเข้า foundu/migrations/all.sql ใน phpMyAdmin แล้วตามด้วย SQL จาก create-admin.php ที่รันบนเครื่องตัวเอง จากนั้นสร้างไฟล์ว่าง foundu/config/install.lock และลบ public_html/install กับ foundu/install-token.txt เพื่อไม่ให้หน้าติดตั้งค้างอยู่

Do not upload a .env.php that was generated inside docker. That file has the container password.
Do not commit or paste install-token.txt or .env.php.
`;

rm(stage);
fs.mkdirSync(stage, { recursive: true });

run("npx", ["next", "build"], root);

const founduStage = path.join(stage, "foundu");
copyDir(path.join(root, "foundu"), founduStage, (name) => {
  return (
    name === "vendor" ||
    name === "tests" ||
    name === ".env" ||
    name === ".env.php" ||
    name === "mock-cf.on" ||
    name === "install-preview.on" ||
    name === "install-token.txt" ||
    name === "install.lock" ||
    name.endsWith(".log")
  );
});
rm(path.join(founduStage, "storage", "cache"));
rm(path.join(founduStage, "storage", "logs"));
fs.mkdirSync(path.join(founduStage, "storage", "cache"), { recursive: true });
fs.mkdirSync(path.join(founduStage, "storage", "logs"), { recursive: true });
for (const file of walk(founduStage)) {
  if (file.endsWith(".php") && path.basename(file) === ".env.php") fs.rmSync(file);
}
const setupToken = randomBytes(32).toString("hex");
fs.writeFileSync(path.join(founduStage, "install-token.txt"), `${setupToken}\n`, { mode: 0o600 });
fs.chmodSync(path.join(founduStage, "install-token.txt"), 0o600);

// --no-dev on the working tree would drop PHPUnit. This copy is the zip.
if (spawnSync("composer", ["--version"], { stdio: "ignore" }).status === 0) {
  run(
    "composer",
    ["install", "--no-dev", "--optimize-autoloader", "--no-interaction", "--working-dir", founduStage],
    root
  );
} else {
  // The composer image has no pdo_mysql. The zip is PHP source.
  // The host that runs it has the extension. Do not ignore this
  // when composer itself is installed on the machine.
  run(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${founduStage}:/app`,
      "-w",
      "/app",
      "composer:2",
      "install",
      "--no-dev",
      "--optimize-autoloader",
      "--no-interaction",
      "--ignore-platform-reqs",
    ],
    root
  );
}

const web = path.join(stage, "public_html");
rm(web);
copyDir(path.join(root, "out"), web, () => false);
for (const name of [".htaccess", ".user.ini", "meta.php", "og.php"]) {
  fs.copyFileSync(path.join(root, "public_html", name), path.join(web, name));
}
copyDir(path.join(root, "public_html", "api"), path.join(web, "api"), () => false);
copyDir(path.join(root, "public_html", "install"), path.join(web, "install"), () => false);
fs.copyFileSync(
  path.join(root, "public_html", "cloudflare-checklist.html"),
  path.join(web, "cloudflare-checklist.html")
);
patchHtaccess(path.join(web, ".htaccess"));

const shellBlog = path.join(web, "blog", "_", "index.html");
const shellHelp = path.join(web, "help", "_", "index.html");
if (!fs.existsSync(shellBlog) || !fs.existsSync(shellHelp)) {
  console.error("missing blog/_ or help/_ shell");
  process.exit(1);
}

fs.writeFileSync(path.join(stage, "README-deploy.txt"), readme);

rm(zipPath);
run("zip", ["-r", "-q", zipPath, "public_html", "foundu", "README-deploy.txt"], stage);

const size = fs.statSync(zipPath).size;
console.log(`wrote ${zipPath} (${size} bytes)`);
