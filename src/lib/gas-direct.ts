/**
 * Direct Google Apps Script (GAS) calls from the browser.
 *
 * Why? Serverless platforms (Netlify free: 10s timeout, 6MB payload;
 * Vercel free: 60s timeout, 4.5MB payload) cannot reliably proxy
 * requests to GAS, especially for:
 * - File uploads (large payloads)
 * - Order data sync (fire-and-forget doesn't work on serverless —
 *   the function is killed as soon as the response is sent)
 *
 * By calling GAS directly from the browser we:
 * 1. Bypass serverless payload limits
 * 2. Bypass serverless timeout limits
 * 3. Eliminate the fire-and-forget problem (browser stays alive)
 * 4. Eliminate an unnecessary network hop
 *
 * GAS Redirect Handling:
 * Google Apps Script returns a 302 redirect after POST requests.
 * With `redirect: "follow"`, the browser follows the redirect and
 * gets the final response. However, sometimes the redirected response
 * is HTML instead of JSON (e.g., Google login page, error page).
 * We handle this by attempting to parse the response as JSON,
 * and if that fails, we try to extract JSON from HTML content.
 */

// ─── GAS Config (fetched from /api/gas-config at runtime) ────────
interface GasConfig {
  configured: boolean;
  gasUrl?: string;
  token?: string;
  sheetId?: string;
  driveFolderId?: string;
}

let cachedConfig: GasConfig | null = null;

export async function getGasConfig(): Promise<GasConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const res = await fetch("/api/gas-config");
    const text = await res.text();
    cachedConfig = JSON.parse(text);
    return cachedConfig!;
  } catch (err) {
    console.error("❌ Failed to fetch GAS config:", err);
    return { configured: false };
  }
}

// ─── Convert File to Base64 ──────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove "data:...;base64," prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ─── Parse GAS response (handles HTML-wrapped JSON) ──────────────
function parseGasResponse(text: string): Record<string, unknown> | null {
  // 1. Try direct JSON parse
  try {
    return JSON.parse(text);
  } catch {
    // Not direct JSON, continue
  }

  // 2. Try to extract JSON from HTML content
  // GAS sometimes wraps the response in an HTML page with the JSON in the body
  const jsonMatch = text.match(/\{[\s\S]*"status"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Extracted JSON is also invalid
    }
  }

  // 3. Check for common GAS redirect HTML patterns
  if (text.includes("script.google.com") || text.includes("googleusercontent.com")) {
    console.warn("⚠️ GAS returned a redirect page instead of JSON. The script may need redeployment.");
  }

  return null;
}

// ─── Make a GAS POST request with redirect handling ──────────────
async function postToGAS(
  gasUrl: string,
  payload: Record<string, unknown>,
  maxRetries: number = 2
): Promise<{ ok: boolean; result: Record<string, unknown> | null; status: number }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow", // Browser follows GAS 302 automatically
      });

      if (!res.ok) {
        console.error(`❌ GAS request failed with status: ${res.status}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        return { ok: false, result: null, status: res.status };
      }

      const text = await res.text();
      const result = parseGasResponse(text);

      if (result) {
        return { ok: true, result, status: res.status };
      }

      // Non-JSON response — log a snippet for debugging
      console.error(`❌ GAS non-JSON response (attempt ${attempt}/${maxRetries}, first 300 chars): ${text.slice(0, 300)}`);

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }

      return { ok: false, result: null, status: res.status };
    } catch (err) {
      console.error(`❌ GAS request exception (attempt ${attempt}/${maxRetries}):`, err);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      return { ok: false, result: null, status: 0 };
    }
  }

  return { ok: false, result: null, status: 0 };
}

// ─── Save order data directly to GAS Sheet ───────────────────────
export async function saveOrderDirectToGAS(data: {
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
}): Promise<{ success: boolean; sheetRow?: number }> {
  const config = await getGasConfig();

  if (!config.configured || !config.gasUrl) {
    console.warn("⚠️ GAS not configured, skipping direct order save");
    return { success: false };
  }

  try {
    const payload = {
      _token: config.token,
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
      _sheetId: config.sheetId,
      _driveFolderId: config.driveFolderId,
    };

    console.log(`📤 Direct GAS save: order ${data.orderNumber} to Sheet...`);

    const { ok, result } = await postToGAS(config.gasUrl, payload);

    if (ok && result && result.status === "success") {
      console.log(`✅ Order saved to Sheet directly: row ${result.row || "?"}`);
      return { success: true, sheetRow: result.row as number | undefined };
    } else {
      console.error(`❌ GAS direct save error:`, result?.message || "unknown error");
      return { success: false };
    }
  } catch (err) {
    console.error("❌ GAS direct save exception:", err);
    return { success: false };
  }
}

// ─── Upload file directly to GAS ────────────────────────────────
export async function uploadFileDirectToGAS(
  orderNumber: string,
  fileType: string, // "print" or "receipt"
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; fileUrl?: string; fileName?: string }> {
  const config = await getGasConfig();

  if (!config.configured || !config.gasUrl) {
    console.warn("⚠️ GAS not configured, falling back to server upload");
    return { success: false };
  }

  try {
    onProgress?.(10);

    // Convert file to base64
    const base64Data = await fileToBase64(file);
    const safeName = file.name.replace(/[^\w\u0600-\u06FF.\-() ]/g, "").slice(0, 200) || "upload.bin";

    onProgress?.(30);

    const payload = {
      _token: config.token,
      action: "uploadFile",
      data: {
        orderNumber,
        fileType,
        fileData: base64Data,
        fileName: safeName,
        fileMimeType: file.type || "application/octet-stream",
      },
      _sheetId: config.sheetId,
      _driveFolderId: config.driveFolderId,
    };

    onProgress?.(40);

    // POST directly to GAS — browser handles 302 redirect automatically
    console.log(`📤 Direct GAS upload: ${fileType} file "${safeName}" (${(base64Data.length / 1024).toFixed(0)}KB base64)`);

    const { ok, result } = await postToGAS(config.gasUrl, payload);

    onProgress?.(80);

    if (ok && result && result.status === "success") {
      onProgress?.(100);
      console.log(`✅ GAS direct upload success: ${result.fileUrl}`);
      return { success: true, fileUrl: result.fileUrl as string, fileName: safeName };
    } else {
      onProgress?.(100);
      console.error(`❌ GAS direct upload error:`, result?.message || "unknown error");
      return { success: false, fileName: safeName };
    }
  } catch (err) {
    console.error("❌ GAS direct upload exception:", err);
    return { success: false };
  }
}

// ─── Update file URLs in Sheet directly via GAS ──────────────────
export async function updateFileUrlsDirectGAS(
  orderNumber: string,
  printFileUrl?: string,
  receiptFileUrl?: string
): Promise<boolean> {
  const config = await getGasConfig();

  if (!config.configured || !config.gasUrl) {
    return false;
  }

  try {
    const data: Record<string, unknown> = { orderNumber };
    if (printFileUrl) data.printFileUrl = printFileUrl;
    if (receiptFileUrl) data.receiptFileUrl = receiptFileUrl;

    const payload = {
      _token: config.token,
      action: "updateFileUrls",
      data,
      _sheetId: config.sheetId,
      _driveFolderId: config.driveFolderId,
    };

    // Await this — the browser stays alive and can complete the request
    const { ok, result } = await postToGAS(config.gasUrl, payload, 1);

    if (ok && result && result.status === "success") {
      console.log(`✅ File URLs updated in Sheet for order ${orderNumber}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
