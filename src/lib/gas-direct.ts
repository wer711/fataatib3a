/**
 * Direct Google Apps Script (GAS) upload from the browser.
 *
 * Why? Serverless platforms (Netlify free: 10s timeout, 6MB payload;
 * Vercel free: 60s timeout, 4.5MB payload) cannot reliably proxy large
 * file uploads to GAS. By uploading directly from the browser we:
 *
 * 1. Bypass serverless payload limits (browser can POST up to ~50MB)
 * 2. Bypass serverless timeout limits (browser can wait as long as needed)
 * 3. Eliminate an unnecessary network hop (faster for the user)
 *
 * GAS web app endpoints DO support CORS for POST requests with
 * `Content-Type: text/plain`, so the browser can call them directly.
 * The 302 redirect that GAS returns is automatically followed by the
 * browser's fetch implementation.
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

    const res = await fetch(config.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow", // Browser follows GAS 302 automatically
    });

    onProgress?.(80);

    if (!res.ok) {
      console.error(`❌ GAS direct upload failed with status: ${res.status}`);
      return { success: false, fileName: safeName };
    }

    let result: Record<string, unknown>;
    try {
      const text = await res.text();
      result = JSON.parse(text);
    } catch {
      console.error("❌ GAS direct upload: non-JSON response");
      return { success: false, fileName: safeName };
    }

    onProgress?.(100);

    if (result.status === "success") {
      console.log(`✅ GAS direct upload success: ${result.fileUrl}`);
      return { success: true, fileUrl: result.fileUrl as string, fileName: safeName };
    } else {
      console.error(`❌ GAS direct upload error:`, result.message);
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

    // Fire-and-forget with a short timeout
    fetch(config.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    }).catch(() => {});

    return true;
  } catch {
    return false;
  }
}
