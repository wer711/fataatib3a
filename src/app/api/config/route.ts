import { NextResponse } from "next/server";

// Returns public configuration needed by the client (no secrets)
export async function GET() {
  return NextResponse.json({
    googleScriptUrl: process.env.GOOGLE_SCRIPT_URL || "",
    maxFileSize: 10 * 1024 * 1024, // 10MB
  });
}
