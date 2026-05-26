import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const ALLOWED_FOLDERS = new Set(["img", "img/mobile_responsive"]);

function toDisplayName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "img";
    const safeFolder = ALLOWED_FOLDERS.has(folder) ? folder : "img";
    const dirPath = path.join(process.cwd(), "public", ...safeFolder.split("/"));
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

    const imageFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => collator.compare(a, b));

    const images = await Promise.all(
      imageFiles.map(async (fileName) => {
        const filePath = path.join(dirPath, fileName);
        const fileBuffer = await fs.readFile(filePath);
        const dim = imageSize(fileBuffer);
        return {
          fileName,
          label: toDisplayName(fileName),
          url: `/${safeFolder}/${encodeURIComponent(fileName)}`,
          width: dim.width ?? 1080,
          height: dim.height ?? 1920,
        };
      })
    );

    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
