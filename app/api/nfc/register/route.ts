import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthRequest,
  registerNfcTagAdmin,
  type RegisterNfcTagInput,
} from "@/lib/nfc-server";
import type { ContactInfo, ItemCategory } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuthRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { itemName, category, description, contacts, tagUid, readOnlyLocked } = body as {
      itemName?: string;
      category?: ItemCategory;
      description?: string;
      contacts?: ContactInfo[];
      tagUid?: string;
      readOnlyLocked?: boolean;
    };

    if (!itemName?.trim() || !category) {
      return NextResponse.json({ error: "itemName and category required" }, { status: 400 });
    }

    const validContacts = (contacts || []).filter((c) => c.value?.trim());
    if (validContacts.length === 0) {
      return NextResponse.json({ error: "At least one contact required" }, { status: 400 });
    }

    const input: RegisterNfcTagInput = {
      itemName: itemName.trim(),
      category,
      description: description?.trim(),
      contacts: validContacts,
      tagUid: tagUid?.trim() || undefined,
      readOnlyLocked: Boolean(readOnlyLocked),
    };

    const result = await registerNfcTagAdmin(user.uid, input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "tag_uid_already_registered") {
      return NextResponse.json({ error: message, message: "แท็ก NFC นี้ถูกลงทะเบียนแล้ว" }, { status: 409 });
    }
    if (message === "nfc_disabled") {
      return NextResponse.json({ error: message, message: "ระบบ NFC ถูกปิดใช้งานชั่วคราว" }, { status: 403 });
    }
    console.error("NFC register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
