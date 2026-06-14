import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ─── Configuration ──────────────────────────────────────────
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "";
const SHEET_SECRET_TOKEN = process.env.SHEET_SECRET_TOKEN || "ffc0b9b5959d4a9149eed95327b88f02b1c6ee8b64a723d2";
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// ─── Database helper ────────────────────────────────────────
async function saveToDatabase(data: {
  orderNumber: string;
  fullName: string;
  phone: string;
  printFileName: string | null;
  pageCount: number;
  paperSize: string;
  printSide: string;
  copies: number;
  colorType: string;
  bindingType: string;
  payMethod: string;
  receiptFileName: string | null;
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
        pageCount: data.pageCount,
        paperSize: data.paperSize,
        printSide: data.printSide,
        copies: data.copies,
        colorType: data.colorType,
        bindingType: data.bindingType,
        payMethod: data.payMethod,
        receiptFileName: data.receiptFileName,
        deliveryMethod: data.deliveryMethod,
        address: data.address,
        notes: data.notes,
        totalPrice: data.totalPrice,
        status: "جديد",
      },
    });
    console.log(`✅ Order ${data.orderNumber} saved to local DB`);
    return true;
  } catch (dbError) {
    console.log(`⚠️ Local DB not available, order ${data.orderNumber} will sync to Google Sheets`);
    return false;
  }
}

// ─── Rate Limiter ───────────────────────────────────────────
interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

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

// ─── Pricing ────────────────────────────────────────────────
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
    (PRICING.binding[data.bindingType as keyof typeof PRICING.binding] || 0) * data.copies;
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

function sanitizeInt(value: string | number | null, defaultValue: number, min: number = 1): number {
  if (!value) return defaultValue;
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed) || parsed < min) return defaultValue;
  return parsed;
}

// ─── Google Sheets Sync — Fire and Forget with retry ────────
// This runs in the background and does NOT block the API response.
// Critical for serverless platforms with short timeouts (Netlify 10s).
async function syncOrderToSheet(data: {
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
  receiptFileName: string | null;
  deliveryMethod: string;
  address: string;
  notes: string;
  status: string;
}): Promise<void> {
  if (!GOOGLE_SCRIPT_URL) {
    console.log("⚠️ GOOGLE_SCRIPT_URL not configured, skipping Google Sheets sync");
    return;
  }

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const payload = {
        _token: SHEET_SECRET_TOKEN,
        action: "saveOrder",
        data: {
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
          receiptFileName: data.receiptFileName,
          deliveryMethod: data.deliveryMethod,
          address: data.address,
          notes: data.notes,
          status: data.status,
        },
        _sheetId: GOOGLE_SHEET_ID,
        _driveFolderId: GOOGLE_DRIVE_FOLDER_ID,
      };

      const controller = new AbortController();
      // Progressive timeout: 30s, 45s, 60s
      const timeoutMs = 30000 + (attempt - 1) * 15000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      console.log(`📤 [Attempt ${attempt}/${maxRetries}] Syncing order ${data.orderNumber} to Sheet (timeout: ${timeoutMs / 1000}s)...`);

      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow", // Let the runtime follow GAS redirects automatically
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        try {
          const result = await res.json();
          if (result.status === "success") {
            console.log(`✅ Order ${data.orderNumber} synced to Sheet (row: ${result.row || "?"})`);
            return;
          } else {
            console.error(`❌ Sheet sync failed:`, result.message);
          }
        } catch {
          // Response wasn't JSON — might be a GAS redirect page
          const text = await res.text();
          console.error(`❌ Sheet sync: non-JSON response (first 200 chars): ${text.slice(0, 200)}`);
        }
      } else {
        console.error(`❌ Sheet sync failed with HTTP status: ${res.status}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        errMsg.includes("abort") ||
        errMsg.includes("ETIMEDOUT") ||
        errMsg.includes("ECONNRESET") ||
        errMsg.includes("fetch failed") ||
        errMsg.includes("socket hang up");

      if (isRetryable && attempt < maxRetries) {
        const delay = attempt * 3000;
        console.log(`⏳ Sheet sync retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.error(`❌ Sheet sync failed after ${maxRetries} attempts:`, errMsg);
      return;
    }
  }
}

// ─── POST Handler — Responds FAST, syncs to Sheet in background ─
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

    // 2. Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "بيانات غير صالحة" },
        { status: 400 }
      );
    }

    // 3. Extract and sanitize text fields
    const fullName = sanitize(String(body.fullName || ""));
    const phone = sanitize(String(body.phone || ""));
    const pageCount = sanitizeInt(body.pageCount as string | number | null, 10);
    const paperSize = sanitize(String(body.paperSize || "A4 - قياسي"));
    const printSide = sanitize(String(body.printSide || "وجه واحد فقط"));
    const copies = sanitizeInt(body.copies as string | number | null, 1);
    const colorType = sanitize(String(body.colorType || "أسود وأبيض"));
    const bindingType = sanitize(String(body.bindingType || "بدون تغليف"));
    const payMethod = sanitize(String(body.payMethod || ""));
    const deliveryMethod = sanitize(String(body.deliveryMethod || "استلام من المكتبة"));
    const address = sanitize(String(body.address || ""));
    const notes = sanitize(String(body.notes || ""));
    const printFileName = body.printFileName ? sanitize(String(body.printFileName)) : null;
    const receiptFileName = body.receiptFileName ? sanitize(String(body.receiptFileName)) : null;

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

    // 5. Calculate price
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

    // 6. Generate order number
    const orderNumber = generateOrderNumber();

    // 7. Save to local database (optional — gracefully skips if DB not available)
    await saveToDatabase({
      orderNumber,
      fullName,
      phone: phoneClean,
      printFileName,
      pageCount,
      paperSize,
      printSide,
      copies,
      colorType,
      bindingType,
      payMethod,
      receiptFileName,
      deliveryMethod,
      address: address || null,
      notes: notes || null,
      totalPrice,
    });

    // 8. Sync to Google Sheets — FIRE AND FORGET (non-blocking)
    // This is the key change for serverless compatibility:
    // We respond immediately and let the Sheet sync happen in the background.
    // The frontend will also call GAS directly for file uploads.
    syncOrderToSheet({
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
      receiptFileName,
      deliveryMethod,
      address,
      notes,
      status: "جديد",
    }).catch((err) => {
      console.error(`❌ Background Sheet sync failed for order ${orderNumber}:`, err);
    });

    // 9. Respond IMMEDIATELY — don't wait for GAS
    const hasPrintFile = !!body.hasPrintFile;
    const hasReceiptFile = !!body.hasReceiptFile;

    return NextResponse.json({
      status: "success",
      order: {
        orderNumber,
        totalPrice,
        createdAt: new Date().toISOString(),
        sheetSynced: true, // Optimistic — will sync in background
      },
      pendingFiles: {
        printFile: hasPrintFile,
        receiptFile: hasReceiptFile,
      },
    });
  } catch (error) {
    console.error("[Order] Error creating order:", error);

    let message = "حدث خطأ غير متوقع";
    if (error instanceof Error) {
      if (error.message.includes("حجم الملف")) {
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
