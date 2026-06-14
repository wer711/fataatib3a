import { NextResponse } from "next/server";

/**
 * Provides Google Apps Script configuration to the frontend.
 * This allows the frontend to call GAS directly for file uploads,
 * bypassing serverless function payload limits and timeouts.
 *
 * The GAS URL and token are semi-public anyway (visible in network traffic),
 * so exposing them through this endpoint is acceptable.
 * The GAS script itself validates the token on every request.
 */
export async function GET() {
  const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL || "";
  const sheetToken = process.env.SHEET_SECRET_TOKEN || "";
  const sheetId = process.env.GOOGLE_SHEET_ID || "";
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

  // If no GAS URL configured, return empty config
  if (!googleScriptUrl) {
    return NextResponse.json({
      configured: false,
      message: "Google Apps Script not configured",
    });
  }

  return NextResponse.json({
    configured: true,
    gasUrl: googleScriptUrl,
    token: sheetToken,
    sheetId,
    driveFolderId,
  });
}
