import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "google-apps-script.js");
    const fileContent = readFileSync(filePath, "utf-8");

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Content-Disposition": 'attachment; filename="google-apps-script.js"',
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "الملف غير موجود" },
      { status: 404 }
    );
  }
}
