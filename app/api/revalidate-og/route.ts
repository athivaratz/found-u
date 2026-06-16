import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { OG_METADATA_CACHE_TAG } from "@/lib/seo-metadata";

export async function POST() {
  revalidateTag(OG_METADATA_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ revalidated: true });
}
