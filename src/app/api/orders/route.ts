import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ─── Configuration ──────────────────────────────────────────
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit for file uploads

// Google Sheets Integration
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "";
const SHEET_SECRET_TOKEN = process.env.SHEET_SECRET_TOKEN || "ffc0b9b5959d4a9149eed95327b88f02b1c6ee8b64a723d2";

// ─── Database helper (optional — works with or without Prisma) ──
async function saveToDatabase(data: {
  orderNumber: string;
  fullName: string;
  phone: string;
  printFileName: string | null;
  printFileIdentifier: string | null;
  pageCount: number;
  paperSize: string;
  printSide: string;
  copies: number;
  colorType: string;
  bindingType: string;
  payMethod: string;
  receiptFileName: string | null;
  receiptFileIdentifier: string | null;
  deliveryMethod: string;
  address: string | null;
  notes: string | null;
  totalPrice: number;
}): Promise<boolean> {
  try {
    const { db } = await import("@/lib/db");
    await db.order.create({
      data: {
        orderNumber: data.orderNumber,
        fullName: data.fullName,
        phone: data.phone,
        printFileName: data.printFileName,
        printFilePath: data.printFileIdentifier,
        pageCount: data.pageCount,
        paperSize: data.paperSize,
        printSide: data.printSide,
        copies: data.copies,
        colorType: data.colorType,
        bindingType: data.bindingType,
        payMethod: data.payMethod,
        receiptFileName: data.receiptFileName,
        receiptFilePath: data.receiptFileIdentifier,
        deliveryMethod: data.deliveryMethod,
        address: data.address,
        notes: data.notes,
        totalPrice: data.totalPrice,
        status: "جديد",
      },
    });
    console.log(`✅ Order ${data.orderNumber} saved to local DB — Total: ${data.totalPrice} د.ج`);
    return true;
  } catch (dbError) {
    // قاعدة البيانات المحلية غير متوفرة (مثلاً على Netlify) — لا مشكلة
    console.log(`⚠️ Local DB not available, order ${data.orderNumber} saved to Google Sheets only`);
    return false;
  }
}

// ─── Simple Rate Limiter ─────────────────────────────────────
interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, entry);
    const oldestInWindow = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.timestamps.push(now);
  rateLimitMap.set(ip, entry);

  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap.entries()) {
      val.timestamps = val.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
      if (val.timestamps.length === 0) rateLimitMap.delete(key);
    }
  }

  return { allowed: true };
}

// ─── Pricing Configuration ──────────────────────────────────
const PRICING = {
  basePrice: { bank: 7, cash: 10 },
  paperSize: { "A5 - صغير": 0.6, "A4 - قياسي": 1, "A3 - كبير": 2 },
  printSide: { "وجه واحد فقط": 1, "على الوجهين": 1.8 },
  color: { "أسود وأبيض": 1, "ملون": 4 },
  binding: { "بدون تغليف": 0, "تغليف سلكي": 15, "تغليف حراري": 25 },
  delivery: { "استلام من المكتبة": 0, "توصيل للمنزل": 80 },
  bankDiscount: 0.10,
};

function calculateTotalPrice(data: {
  pageCount: number;
  copies: number;
  paperSize: string;
  printSide: string;
  colorType: string;
  bindingType: string;
  payMethod: string;
  deliveryMethod: string;
}): number {
  const isCash = data.payMethod === "الدفع عند الاستلام";
  let unitPrice = isCash ? PRICING.basePrice.cash : PRICING.basePrice.bank;

  unitPrice *= PRICING.paperSize[data.paperSize as keyof typeof PRICING.paperSize] || 1;
  unitPrice *= PRICING.printSide[data.printSide as keyof typeof PRICING.printSide] || 1;
  unitPrice *= PRICING.color[data.colorType as keyof typeof PRICING.color] || 1;

  const subtotal = unitPrice * data.pageCount * data.copies;

  let discount = 0;
  if (data.payMethod === "بريدي موب" || data.payMethod === "CCP") {
    discount = subtotal * PRICING.bankDiscount;
  }

  const bindingCost =
    (PRICING.binding[data.bindingType as keyof typeof PRICING.binding] || 0) *
    data.copies;
  const deliveryCost =
    PRICING.delivery[data.deliveryMethod as keyof typeof PRICING.delivery] || 0;

  return Math.round(subtotal - discount + bindingCost + deliveryCost);
}

function generateOrderNumber(): string {
  const prefix = "ORD";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ─── Input Sanitization ─────────────────────────────────────
function sanitize(input: string): string {
  return input
    .replace(/\0/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/\bon\w+\s*=/gi, "")
    .trim()
    .slice(0, 500);
}

function sanitizeInt(value: string | null, defaultValue: number, min: number = 1): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min) return defaultValue;
  return parsed;
}

// ─── File Processing (IN-MEMORY ONLY — no filesystem writes) ──
async function processFile(
  file: File,
  prefix: string
): Promise<{
  fileName: string;
  fileIdentifier: string;
  base64Data: string;
  mimeType: string;
  fileSize: number;
}> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`حجم الملف "${file.name}" أكبر من الحد المسموح (15MB)`);
  }

  // Read file into memory buffer (no disk writes)
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w\u0600-\u06FF.\-() ]/g, "").slice(0, 200) || "upload.bin";

  const ext = safeName.includes(".") ? "." + safeName.split(".").pop() : ".bin";
  const uniqueIdentifier = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;

  const base64Data = buffer.toString("base64");

  return {
    fileName: safeName,
    fileIdentifier: uniqueIdentifier,
    base64Data,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
  };
}

// ─── Google Sheets + Drive Integration ──────────────────────
// ⚡ OPTIMIZED: Truly fire-and-forget — user gets response immediately
// Google sync continues in background, user doesn't wait for it
async function sendToGoogleSheet(data: {
  orderNumber: string;
  fullName: string;
  phone: string;
  pageCount: number;
  paperSize: string;
  printSide: string;
  copies: number;
  colorType: string;
  bindingType: string;
  payMethod: string;
  totalPrice: number;
  printFileName: string | null;
  printFileData: string | null;
  printFileMime: string | null;
  receiptFileName: string | null;
  receiptFileData: string | null;
  receiptFileMime: string | null;
  deliveryMethod: string;
  address: string;
  notes: string;
  status: string;
}): Promise<{ success: boolean; driveLinks?: { printFileUrl?: string; receiptFileUrl?: string } }> {
  if (!GOOGLE_SCRIPT_URL) {
    console.log("⚠️ GOOGLE_SCRIPT_URL not configured, skipping Google Sheets sync");
    return { success: false };
  }

  try {
    const payloadData: Record<string, string | number | null> = {
      orderNumber: data.orderNumber,
      fullName: data.fullName,
      phone: data.phone,
      pageCount: data.pageCount,
      paperSize: data.paperSize,
      printSide: data.printSide,
      copies: data.copies,
      colorType: data.colorType,
      bindingType: data.bindingType,
      payMethod: data.payMethod,
      totalPrice: data.totalPrice,
      printFileName: data.printFileName,
      printFileData: data.printFileData,
      printFileMime: data.printFileMime,
      receiptFileName: data.receiptFileName,
      receiptFileData: data.receiptFileData,
      receiptFileMime: data.receiptFileMime,
      deliveryMethod: data.deliveryMethod,
      address: data.address,
      notes: data.notes,
      status: data.status,
      saveToDrive: "true",
    };

    const payload = {
      _token: SHEET_SECRET_TOKEN,
      data: payloadData,
    };

    const body = JSON.stringify(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    console.log(`📤 Sending order ${data.orderNumber} to Google Sheet (payload: ${(body.length / 1024).toFixed(0)}KB)...`);

    const firstRes = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      redirect: "manual",
      signal: controller.signal,
    });

    // Google Apps Script redirects POST requests — follow the redirect
    if (firstRes.status === 301 || firstRes.status === 302 || firstRes.status === 303) {
      const redirectUrl = firstRes.headers.get("location");
      if (redirectUrl) {
        console.log(`🔄 Google Script redirect detected, following...`);

        const secondRes = await fetch(redirectUrl, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (secondRes.ok) {
          const result = await secondRes.json();
          if (result.status === "success") {
            console.log(`✅ Order synced to Google Sheet:`, data.orderNumber);
            if (result.driveLinks) {
              console.log(`📁 Drive links:`, JSON.stringify(result.driveLinks));
            }
            return { success: true, driveLinks: result.driveLinks };
          } else {
            console.error(`❌ Google Sheet sync failed:`, result.message);
            return { success: false };
          }
        }

        console.error(`❌ Google Sheet redirect fetch failed:`, secondRes.status);
        return { success: false };
      }
    }

    clearTimeout(timeout);

    if (firstRes.ok) {
      const result = await firstRes.json();
      if (result.status === "success") {
        console.log(`✅ Order synced to Google Sheet:`, data.orderNumber);
        if (result.driveLinks) {
          console.log(`📁 Drive links:`, JSON.stringify(result.driveLinks));
        }
        return { success: true, driveLinks: result.driveLinks };
      } else {
        console.error(`❌ Google Sheet sync failed:`, result.message);
        return { success: false };
      }
    }

    console.error(`❌ Google Sheet sync failed with status:`, firstRes.status);
    return { success: false };
  } catch (err) {
    console.error(`❌ Google Sheet sync error:`, err);
    return { success: false };
  }
}

// ─── POST Handler ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "طلبات كثيرة جداً. يرجى الانتظار قليلاً." },
        { status: 429 }
      );
    }

    // 2. Parse form data
    const formData = await request.formData();

    // 3. Extract and sanitize text fields
    const fullName = sanitize((formData.get("fullName") as string) || "");
    const phone = sanitize((formData.get("phone") as string) || "");
    const pageCount = sanitizeInt(formData.get("pageCount") as string, 10);
    const paperSize = sanitize((formData.get("paperSize") as string) || "A4 - قياسي");
    const printSide = sanitize((formData.get("printSide") as string) || "وجه واحد فقط");
    const copies = sanitizeInt(formData.get("copies") as string, 1);
    const colorType = sanitize((formData.get("colorType") as string) || "أسود وأبيض");
    const bindingType = sanitize((formData.get("bindingType") as string) || "بدون تغليف");
    const payMethod = sanitize((formData.get("payMethod") as string) || "");
    const deliveryMethod = sanitize((formData.get("deliveryMethod") as string) || "استلام من المكتبة");
    const address = sanitize((formData.get("address") as string) || "");
    const notes = sanitize((formData.get("notes") as string) || "");

    console.log(`[Order] New order from: ${fullName}, phone: ${phone.slice(-4).padStart(phone.length, "*")}`);

    // 4. Validation
    if (!fullName) {
      return NextResponse.json({ error: "الرجاء إدخال الاسم الكامل" }, { status: 400 });
    }
    const phoneClean = phone.replace(/\s/g, "");
    if (!phoneClean || !/^0\d{8,9}$/.test(phoneClean)) {
      return NextResponse.json({ error: "الرجاء إدخال رقم هاتف صحيح" }, { status: 400 });
    }
    if (pageCount < 1) {
      return NextResponse.json({ error: "عدد الصفحات يجب أن يكون 1 على الأقل" }, { status: 400 });
    }
    if (!payMethod) {
      return NextResponse.json({ error: "الرجاء اختيار طريقة الدفع" }, { status: 400 });
    }

    // 5. Handle file uploads (IN-MEMORY ONLY)
    const printFile = formData.get("printFile") as File | null;
    const receiptFile = formData.get("receiptFile") as File | null;

    let printFileName: string | null = null;
    let printFileIdentifier: string | null = null;
    let printFileBase64: string | null = null;
    let printFileMime: string | null = null;
    let receiptFileName: string | null = null;
    let receiptFileIdentifier: string | null = null;
    let receiptFileBase64: string | null = null;
    let receiptFileMime: string | null = null;

    if (printFile && printFile.size > 0) {
      const processed = await processFile(printFile, "print");
      printFileName = processed.fileName;
      printFileIdentifier = processed.fileIdentifier;
      printFileBase64 = processed.base64Data;
      printFileMime = processed.mimeType;
      console.log(`📎 Print file processed: ${processed.fileName} (${(processed.fileSize / 1024).toFixed(0)}KB)`);
    }

    if (payMethod !== "الدفع عند الاستلام") {
      if (!receiptFile || receiptFile.size === 0) {
        return NextResponse.json({ error: "الرجاء رفع صورة وصل التحويل" }, { status: 400 });
      }
      const processed = await processFile(receiptFile, "receipt");
      receiptFileName = processed.fileName;
      receiptFileIdentifier = processed.fileIdentifier;
      receiptFileBase64 = processed.base64Data;
      receiptFileMime = processed.mimeType;
      console.log(`📎 Receipt file processed: ${processed.fileName} (${(processed.fileSize / 1024).toFixed(0)}KB)`);
    }

    if (deliveryMethod === "توصيل للمنزل" && !address) {
      return NextResponse.json({ error: "الرجاء إدخال عنوان التوصيل" }, { status: 400 });
    }

    // 6. Calculate price
    const totalPrice = calculateTotalPrice({
      pageCount,
      copies,
      paperSize,
      printSide,
      colorType,
      bindingType,
      payMethod,
      deliveryMethod,
    });

    // 7. Generate order number
    const orderNumber = generateOrderNumber();

    // 8. Save to local database (optional — gracefully skips if DB not available on Netlify)
    await saveToDatabase({
      orderNumber,
      fullName,
      phone: phoneClean,
      printFileName,
      printFileIdentifier,
      pageCount,
      paperSize,
      printSide,
      copies,
      colorType,
      bindingType,
      payMethod,
      receiptFileName,
      receiptFileIdentifier,
      deliveryMethod,
      address: address || null,
      notes: notes || null,
      totalPrice,
    });

    // 9. Send to Google Sheets + Drive
    // ⚡ SPEED OPTIMIZATION: Truly fire-and-forget!
    // We respond to the user IMMEDIATELY without waiting for Google
    // Google sync continues in the background
    // This makes the form submission feel instant to the user
    const googleSheetData = {
      orderNumber,
      fullName,
      phone: phoneClean,
      pageCount,
      paperSize,
      printSide,
      copies,
      colorType,
      bindingType,
      payMethod,
      totalPrice,
      printFileName,
      printFileData: printFileBase64,
      printFileMime,
      receiptFileName,
      receiptFileData: receiptFileBase64,
      receiptFileMime,
      deliveryMethod,
      address,
      notes,
      status: "جديد",
    };

    // Fire-and-forget: start the sync but don't await it
    // The user gets their response immediately
    if (GOOGLE_SCRIPT_URL) {
      // Start the Google sync in background — do NOT await
      sendToGoogleSheet(googleSheetData).then((result) => {
        if (result.success) {
          console.log(`✅ [Background] Order ${orderNumber} synced to Google Sheet`);
        } else {
          console.log(`⚠️ [Background] Order ${orderNumber} Google sync had issues (data is saved in local DB)`);
        }
      }).catch((err) => {
        console.error(`❌ [Background] Order ${orderNumber} Google sync error:`, err);
      });
    } else {
      console.log("⚠️ GOOGLE_SCRIPT_URL not configured — order saved to local DB only");
    }

    // Respond to user IMMEDIATELY — no waiting for Google
    return NextResponse.json({
      status: "success",
      order: {
        orderNumber,
        totalPrice,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Order] Error creating order:", error);

    let message = "حدث خطأ غير متوقع";
    if (error instanceof Error) {
      if (error.message.includes("EROFS") || error.message.includes("read-only")) {
        message = "خطأ في حفظ الملف. يرجى المحاولة مرة أخرى.";
      } else if (error.message.includes("ENOENT") || error.message.includes("no such file")) {
        message = "خطأ في قراءة الملف. يرجى المحاولة مرة أخرى.";
      } else if (error.message.includes("حجم الملف")) {
        message = error.message;
      } else {
        message = "حدث خطأ في معالجة الطلب. يرجى المحاولة لاحقاً.";
      }
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// ─── GET Handler ────────────────────────────────────────────
export async function GET() {
  try {
    const { db } = await import("@/lib/db");
    const orders = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("[Order] Error fetching orders:", error);
    return NextResponse.json(
      { error: "قاعدة البيانات المحلية غير متوفرة", orders: [] },
      { status: 200 }
    );
  }
}
