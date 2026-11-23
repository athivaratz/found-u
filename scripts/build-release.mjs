#!/usr/bin/env node
// Builds the DirectAdmin zip: static Next export plus the PHP app.
// Run this on a machine with Node and Composer. The host has neither.

import { createHash } from "node:crypto";
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
4. Copy foundu/config/.env.php.example to foundu/config/.env.php and fill in the database, APP_URL, APP_KEY, and R2 values.
5. Set permissions on foundu/config/.env.php to 600 (File Manager → the file → Permissions).
6. In phpMyAdmin, import foundu/migrations/all.sql, then the admin INSERT printed by create-admin.php on your own computer.
7. Point the domain at public_html. APP_URL must be the public https origin. Purge the Cloudflare cache after each upload.
8. Add a cron job: */5 * * * * php ~/foundu/bin/cron.php

ไทย
1. เปิด File Manager ใน DirectAdmin ไปที่โฟลเดอร์บ้าน (โฟลเดอร์ที่มี public_html)
2. อัปโหลด foundu-release.zip แล้วกด Extract
3. ต้องได้ public_html/ (เว็บ) กับ foundu/ (แอป PHP อยู่ข้าง public_html ไม่ใช่ข้างใน)
4. ก็อป foundu/config/.env.php.example เป็น foundu/config/.env.php แล้วใส่ค่าฐานข้อมูล, APP_URL, APP_KEY และ R2
5. ตั้งสิทธิ์ foundu/config/.env.php เป็น 600
6. ใน phpMyAdmin นำเข้า foundu/migrations/all.sql แล้วตามด้วย SQL ของแอดมินจาก create-admin.php ที่รันบนเครื่องตัวเอง
7. โดเมนต้องชี้มาที่ public_html ค่า APP_URL คือที่อยู่เว็บจริงที่ขึ้นต้นด้วย https หลังอัปโหลดให้ล้างแคช Cloudflare
8. ตั้ง cron: */5 * * * * php ~/foundu/bin/cron.php

Do not upload a .env.php that was generated inside docker. That file has the container password.
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
