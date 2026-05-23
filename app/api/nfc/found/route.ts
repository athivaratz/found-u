import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthRequest,
  createNfcFoundReportAdmin,
  checkNfcFoundRateLimit,
  getAppSettingsAdmin,
} from "@/lib/nfc-server";
import type { ContactInfo } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const settings = await getAppSettingsAdmin();
    if (settings.nfcEnabled === false) {
      return NextResponse.json(
        { error: "nfc_disabled", message: "ระบบ NFC ถูกปิดใช้งานชั่วคราว" },
        { status: 403 }
      );
    }

    const user = await verifyAuthRequest(request);
    if (!user && settings.nfcRequireLoginToReport !== false) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tagId, finderMessage, locationFound, locationCoords, finderContacts } = body as {
      tagId?: string;
      finderMessage?: string;
      locationFound?: string;
      locationCoords?: { lat: number; lng: number; accuracy?: number; source?: string };
      finderContacts?: ContactInfo[];
    };

    if (!tagId?.trim() || !finderMessage?.trim()) {
      return NextResponse.json({ error: "tagId and finderMessage required" }, { status: 400 });
    }

    const rateLimit = await checkNfcFoundRateLimit(user.uid);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "rate_limit_exceeded", message: rateLimit.message },
        { status: 429 }
      );
    }

    const reportId = await createNfcFoundReportAdmin({
      tagId: tagId.trim(),
      finderUserId: user.uid,
      finderMessage: finderMessage.trim(),
      locationFound: locationFound?.trim(),
      locationCoords,
      finderContacts: (finderContacts || []).filter((c) => c.value?.trim()),
    });

    return NextResponse.json({ reportId, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "tag_not_found") {
      return NextResponse.json({ error: message, message: "ไม่พบแท็ก NFC นี้" }, { status: 404 });
    }
    if (message === "tag_disabled") {
      return NextResponse.json({ error: message, message: "แท็กนี้ถูกปิดใช้งาน" }, { status: 403 });
    }
    if (message === "cannot_report_own_tag") {
      return NextResponse.json(
        { error: message, message: "นี่เป็นแท็กของคุณ ไม่สามารถแจ้งพบของได้" },
        { status: 400 }
      );
    }
    console.error("NFC found error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
