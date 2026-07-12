import { NextResponse } from "next/server";
import {
  getPublicHeroImages,
  type PublicHeroImage,
} from "@/lib/landing-public-data";

export const revalidate = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "img";
    const safeFolder =
      folder === "img/mobile_responsive" ? "img/mobile_responsive" : "img";
    const images: PublicHeroImage[] = await getPublicHeroImages(safeFolder);
    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
