import { NextRequest, NextResponse } from "next/server";
import { verifyAuthRequest, isAdminUser } from "@/lib/nfc-server";
import { importStudentRows, parseStudentCsvContent } from "@/lib/student-auth-server";

export async function POST(request: NextRequest) {
  const authUser = await verifyAuthRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(authUser.uid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const csvContent = body.csvContent as string;
    const dryRun = body.dryRun === true;

    if (!csvContent || typeof csvContent !== "string") {
      return NextResponse.json({ error: "ต้องส่ง csvContent" }, { status: 400 });
    }

    const { rows, errors: parseErrors } = parseStudentCsvContent(csvContent);
    if (rows.length === 0 && parseErrors.length > 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลที่นำเข้าได้", parseErrors }, { status: 400 });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        previewCount: rows.length,
        rows: rows.map((r) => ({
          studentId: r.studentId,
          firstName: r.firstName,
          lastName: r.lastName,
          nickname: r.nickname,
          lineNumber: r.lineNumber,
        })),
        parseErrors,
      });
    }

    const importBatchId = `batch_${Date.now()}`;
    const summary = await importStudentRows(rows, importBatchId, authUser.uid);
    summary.errors.push(...parseErrors);

    return NextResponse.json({ importBatchId, summary, previewCount: rows.length });
  } catch (err) {
    console.error("Student import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
