import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";

/**
 * เปลี่ยนสถานะรายการของเจอที่เลยกำหนดส่งห้องบุคคลเป็น expired (ใช้ Admin SDK)
 */
export async function expireOverdueFoundItemsAdmin(): Promise<number> {
  const settingsSnap = await adminDb.collection("settings").doc("appSettings").get();
  const settingsData = settingsSnap.data();
  const enabled =
    settingsData?.foundHandoverDeadlineEnabled ??
    DEFAULT_APP_SETTINGS.foundHandoverDeadlineEnabled ??
    true;

  if (!enabled) return 0;

  const minutes = Math.max(
    1,
    settingsData?.foundHandoverDeadlineMinutes ??
      DEFAULT_APP_SETTINGS.foundHandoverDeadlineMinutes ??
      60
  );

  const nowMs = Date.now();
  const snap = await adminDb
    .collection("foundItems")
    .where("status", "==", "pending_room_confirm")
    .get();

  if (snap.empty) return 0;

  const batch = adminDb.batch();
  let count = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    let deadlineMs: number | null = null;

    if (data.handoverDeadlineAt) {
      deadlineMs =
        typeof data.handoverDeadlineAt.toMillis === "function"
          ? data.handoverDeadlineAt.toMillis()
          : data.handoverDeadlineAt.toDate().getTime();
    } else if (data.createdAt) {
      const createdMs =
        typeof data.createdAt.toMillis === "function"
          ? data.createdAt.toMillis()
          : data.createdAt.toDate().getTime();
      deadlineMs = createdMs + minutes * 60 * 1000;
    }

    if (deadlineMs !== null && deadlineMs < nowMs) {
      batch.update(docSnap.ref, {
        status: "expired",
        expiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  return count;
}
