import { NextRequest, NextResponse } from "next/server";

// ─── Configuration ──────────────────────────────────────────
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "";
const SHEET_SECRET_TOKEN = process.env.SHEET_SECRET_TOKEN || "ffc0b9b5959d4a9149eed95327b88f02b1c6ee8b64a723d2";
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// ─── Retry helper ────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      // Increase timeout per attempt: 120s, 150s, 180s
      const timeoutMs = 120000 + (attempt - 1) * 30000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      // Create fresh options with new AbortController for each attempt
      const freshOptions: RequestInit = {
        ...options,
        signal: controller.signal,
      };

      const res = await fetch(url, freshOptions);
      clearTimeout(timeout);
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTimeout =
        lastError.message.includes("abort") ||
        lastError.message.includes("ETIMEDOUT") ||
        lastError.message.includes("ECONNRESET") ||
        lastError.message.includes("fetch failed") ||
        lastError.message.includes("socket hang up");

      if (isTimeout && attempt < maxRetries) {
        const delay = baseDelay * attempt; // 2s, 4s, 6s
        console.log(`⏳ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms (error: ${lastError.message})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Unknown error");
}

// ─── Google Sheets Integration — Upload File ────────────────
async function uploadFileToDrive(
  orderNumber: string,
  fileType: string,
  fileData: string,
  fileName: string,
  fileMimeType: string
): Promise<{ success: boolean; fileUrl?: string }> {
  if (!GOOGLE_SCRIPT_URL) {
    console.log("⚠️ GOOGLE_SCRIPT_URL not configured, skipping file upload");
    return { success: false };
  }

  try {
    const payload = {
      _token: SHEET_SECRET_TOKEN,
      action: "uploadFile",
      data: {
        orderNumber,
        fileType, // "print" or "receipt"
        fileData,
        fileName,
        fileMimeType,
      },
      // Pass sheet/folder IDs from .env so the GAS script uses the correct targets
      _sheetId: GOOGLE_SHEET_ID,
      _driveFolderId: GOOGLE_DRIVE_FOLDER_ID,
    };

    const body = JSON.stringify(payload);
    console.log(`📤 Uploading ${fileType} file "${fileName}" for order ${orderNumber} (${(body.length / 1024).toFixed(0)}KB)...`);

    const firstRes = await fetchWithRetry(
      GOOGLE_SCRIPT_URL,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body,
        redirect: "manual",
      },
      3,  // max retries
      3000 // base delay
    );

    // Handle GAS redirect
    if (firstRes.status === 301 || firstRes.status === 302 || firstRes.status === 303) {
      const redirectUrl = firstRes.headers.get("location");
      if (redirectUrl) {
        console.log(`🔄 Google Script redirect detected for file upload, following...`);
        const secondRes = await fetchWithRetry(
          redirectUrl,
          {
            method: "GET",
            redirect: "follow",
          },
          3,
          2000
        );

        if (secondRes.ok) {
          const result = await secondRes.json();
          if (result.status === "success") {
            console.log(`✅ File uploaded to Drive: ${result.fileUrl} (folder: ${result.driveFolderId || "unknown"})`);
            return { success: true, fileUrl: result.fileUrl };
          } else {
            console.error(`❌ File upload failed:`, result.message);
            return { success: false };
          }
        }
        console.error(`❌ File upload redirect fetch failed:`, secondRes.status);
        return { success: false };
      }
    }

    if (firstRes.ok) {
      const result = await firstRes.json();
      if (result.status === "success") {
        console.log(`✅ File uploaded to Drive: ${result.fileUrl}`);
        return { success: true, fileUrl: result.fileUrl };
      } else {
        console.error(`❌ File upload failed:`, result.message);
        return { success: false };
      }
    }

    console.error(`❌ File upload failed with status:`, firstRes.status);
    return { success: false };
  } catch (err) {
    console.error(`❌ File upload error (all retries exhausted):`, err);
    return { success: false };
  }
}

// ─── Google Sheets Integration — Update File URLs ───────────
async function updateSheetFileUrls(
  orderNumber: string,
  printFileUrl?: string,
  receiptFileUrl?: string
): Promise<{ success: boolean }> {
  if (!GOOGLE_SCRIPT_URL) {
    return { success: false };
  }

  try {
    const payload: Record<string, unknown> = {
      _token: SHEET_SECRET_TOKEN,
      action: "updateFileUrls",
      data: {
        orderNumber,
      },
      // Pass sheet/folder IDs from .env so the GAS script uses the correct targets
      _sheetId: GOOGLE_SHEET_ID,
      _driveFolderId: GOOGLE_DRIVE_FOLDER_ID,
    };

    if (printFileUrl) {
      (payload.data as Record<string, unknown>).printFileUrl = printFileUrl;
    }
    if (receiptFileUrl) {
      (payload.data as Record<string, unknown>).receiptFileUrl = receiptFileUrl;
    }

    const body = JSON.stringify(payload);

    const firstRes = await fetchWithRetry(
      GOOGLE_SCRIPT_URL,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        redirect: "manual",
      },
      3,
      2000
    );

    if (firstRes.status === 301 || firstRes.status === 302 || firstRes.status === 303) {
      const redirectUrl = firstRes.headers.get("location");
      if (redirectUrl) {
        const secondRes = await fetchWithRetry(
          redirectUrl,
          {
            method: "GET",
            redirect: "follow",
          },
          3,
          2000
        );

        if (secondRes.ok) {
          const result = await secondRes.json();
          return { success: result.status === "success" };
        }
        return { success: false };
      }
    }

    if (firstRes.ok) {
      const result = await firstRes.json();
      return { success: result.status === "success" };
    }

    return { success: false };
  } catch (err) {
    console.error(`❌ Update file URLs error (all retries exhausted):`, err);
    return { success: false };
  }
}

// ─── POST Handler — One file per request ────────────────────
export async function POST(request: NextRequest) {
  try {
    // Parse FormData (one file at a time)
    const formData = await request.formData();

    const orderNumber = formData.get("orderNumber") as string;
    const fileType = formData.get("fileType") as string; // "print" or "receipt"
    const file = formData.get("file") as File | null;

    // Validation
    if (!orderNumber) {
      return NextResponse.json(
        { error: "رقم الطلب مطلوب" },
        { status: 400 }
      );
    }

    if (!fileType || !["print", "receipt"].includes(fileType)) {
      return NextResponse.json(
        { error: "نوع الملف غير صالح" },
        { status: 400 }
      );
    }

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "الملف مطلوب" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `حجم الملف "${file.name}" أكبر من الحد المسموح (15MB)` },
        { status: 400 }
      );
    }

    console.log(`[Upload] ${fileType} file for order ${orderNumber}: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Data = buffer.toString("base64");
    const safeName = file.name.replace(/[^\w\u0600-\u06FF.\-() ]/g, "").slice(0, 200) || "upload.bin";

    // Upload to Google Drive (with built-in retry)
    const uploadResult = await uploadFileToDrive(
      orderNumber,
      fileType,
      base64Data,
      safeName,
      file.type || "application/octet-stream"
    );

    if (!uploadResult.success) {
      console.error(`❌ Failed to upload ${fileType} file for order ${orderNumber} (all retries exhausted)`);
      // Still return partial success — the order exists in Sheet, just the file failed
      return NextResponse.json({
        status: "partial_success",
        message: "تم حفظ الطلب لكن فشل رفع الملف. يرجى المحاولة مرة أخرى.",
        fileType,
        fileName: safeName,
        fileUrl: null,
      });
    }

    // Update Sheet with file URL (fire-and-forget, don't block the response)
    const printFileUrl = fileType === "print" ? uploadResult.fileUrl : undefined;
    const receiptFileUrl = fileType === "receipt" ? uploadResult.fileUrl : undefined;

    // Don't await - let it run in background so the user gets a faster response
    updateSheetFileUrls(orderNumber, printFileUrl, receiptFileUrl).catch(() => {});

    // Try to update local DB
    try {
      const { db } = await import("@/lib/db");
      if (fileType === "print") {
        await db.order.update({
          where: { orderNumber },
          data: { printFilePath: uploadResult.fileUrl || undefined },
        });
      } else {
        await db.order.update({
          where: { orderNumber },
          data: { receiptFilePath: uploadResult.fileUrl || undefined },
        });
      }
    } catch (dbErr) {
      console.log(`⚠️ Local DB not available for update, Sheet will be updated async`);
    }

    console.log(`✅ ${fileType} file uploaded successfully for order ${orderNumber}`);

    return NextResponse.json({
      status: "success",
      fileType,
      fileName: safeName,
      fileUrl: uploadResult.fileUrl,
    });
  } catch (error) {
    console.error("[Upload] Error uploading file:", error);

    let message = "حدث خطأ غير متوقع أثناء رفع الملف";
    if (error instanceof Error) {
      if (error.message.includes("حجم الملف")) {
        message = error.message;
      } else {
        message = "حدث خطأ في رفع الملف. يرجى المحاولة لاحقاً.";
      }
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
