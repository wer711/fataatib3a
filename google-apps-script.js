/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  فضاء الطباعة الرقمية — سكريبت جوجل (Google Apps Script)
 *  ربط مع Google Sheets + Google Drive
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚡ التحديث الجديد:
 *  - المعرفات الصحيحة مضمنة أدناه
 *  - يدعم أيضاً استقبال المعرفات من الخادم (_sheetId و _driveFolderId)
 *  - إذا أُرسلت المعرفات من الخادم، يُفضل استخدامها
 *
 *  📋 تعليمات النشر:
 *  1. افتح https://script.google.com
 *  2. افتح المشروع الحالي أو أنشئ مشروع جديد
 *  3. الصق هذا الكود بالكامل (استبدل القديم)
 *  4. اضغط "نشر" → "إنشاء نشر جديد" ← مهم! لا تعدّل النشر القديم
 *     - نوع: تطبيق ويب
 *     - تنفيذ باسم: أنا (حساب التاجر) ← ⚠️ مهم جداً!
 *     - من يمكنه الوصول: أي شخص
 *  5. إذا طلب "التفويض" → مراجعة الأذونات → اختر حسابك → متابعة → سماح
 *  6. انسخ الرابط الجديد وضعه في ملف .env بعد GOOGLE_SCRIPT_URL=
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── الإعدادات ──────────────────────────────────────────────────────────
var CONFIG = {
  // ✅ معرف شيت جوجل الصحيح
  SHEET_ID: "1qwBgC727vlxyQnrK3dXCQ5_knsEklGeL3EBK5OepmJY",

  // اسم الورقة داخل الشيت
  SHEET_NAME: "الطلبات",

  // ✅ معرف مجلد جوجل درايف الصحيح
  DRIVE_FOLDER_ID: "1NStLD_GY67Cnd5I-D9BP_Ig1FPfbGjAC",

  // ⚠️ التوكن يجب أن يطابق SHEET_SECRET_TOKEN في .env
  SECRET_TOKEN: "ffc0b9b5959d4a9149eed95327b88f02b1c6ee8b64a723d2",
};

// ─── معالجة طلبات POST ──────────────────────────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return sendResponse({ status: "error", message: "لا توجد بيانات" });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return sendResponse({ status: "error", message: "بيانات غير صالحة: " + parseErr.toString() });
    }

    var token = payload._token;
    var action = payload.action || "saveOrder";
    var data = payload.data;

    // ⚡ استخراج المعرفات: يُفضل ما يأتي من الخادم، وإلا نستخدم CONFIG
    var sheetId = payload._sheetId || CONFIG.SHEET_ID;
    var driveFolderId = payload._driveFolderId || CONFIG.DRIVE_FOLDER_ID;

    console.log("📥 طلب وارد — الإجراء: " + action + " | الشيت: " + sheetId + " | المجلد: " + driveFolderId);

    // التحقق من التوكن
    if (token !== CONFIG.SECRET_TOKEN) {
      console.error("❌ التوكن غير متطابق!");
      return sendResponse({ status: "error", message: "رمز الأمان غير صالح" });
    }

    // توجيه الإجراءات
    switch (action) {
      case "saveOrder":
        if (!data || !data.orderNumber) {
          return sendResponse({ status: "error", message: "البيانات غير مكتملة" });
        }
        return handleSaveOrder(data, sheetId);

      case "uploadFile":
        if (!data || !data.orderNumber || !data.fileData) {
          return sendResponse({ status: "error", message: "بيانات الملف غير مكتملة" });
        }
        return handleUploadFile(data, sheetId, driveFolderId);

      case "updateFileUrls":
        if (!data || !data.orderNumber) {
          return sendResponse({ status: "error", message: "بيانات التحديث غير مكتملة" });
        }
        return handleUpdateFileUrls(data, sheetId);

      case "fullSync":
      default:
        if (!data || !data.orderNumber) {
          return sendResponse({ status: "error", message: "البيانات غير مكتملة" });
        }
        return handleFullSync(data, sheetId, driveFolderId);
    }
  } catch (error) {
    console.error("❌ خطأ عام: " + error.toString());
    return sendResponse({ status: "error", message: error.toString() });
  }
}

// ─── معالجة طلبات GET ───────────────────────────────────────────────────
function doGet(e) {
  return sendResponse({
    status: "ok",
    message: "خدمة فضاء الطباعة الرقمية تعمل بشكل طبيعي ✅",
    sheetId: CONFIG.SHEET_ID,
    driveFolder: CONFIG.DRIVE_FOLDER_ID,
    sheetName: CONFIG.SHEET_NAME,
    tokenConfigured: CONFIG.SECRET_TOKEN ? true : false,
    actions: ["saveOrder", "uploadFile", "updateFileUrls", "fullSync"],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  المرحلة 1: حفظ بيانات الطلب في الشيت
// ═══════════════════════════════════════════════════════════════════════════
function handleSaveOrder(data, sheetId) {
  try {
    console.log("📝 حفظ بيانات الطلب: " + data.orderNumber + " في الشيت: " + sheetId);

    var sheet = getSheet(sheetId);
    ensureHeaders(sheet);

    var existingRow = findRowByOrderNumber(sheet, data.orderNumber);
    if (existingRow > 0) {
      console.log("⚠️ الطلب موجود مسبقاً: " + data.orderNumber);
      return sendResponse({ status: "success", message: "الطلب موجود مسبقاً", row: existingRow });
    }

    var rowData = [
      sanitizeCell(data.orderNumber),
      sanitizeCell(data.fullName),
      sanitizeCell(data.phone),
      data.pageCount,
      sanitizeCell(data.paperSize),
      sanitizeCell(data.printSide),
      data.copies,
      sanitizeCell(data.colorType),
      sanitizeCell(data.bindingType),
      sanitizeCell(data.payMethod),
      data.totalPrice,
      sanitizeCell(data.printFileName || ""),
      "",
      sanitizeCell(data.receiptFileName || ""),
      "",
      sanitizeCell(data.deliveryMethod),
      sanitizeCell(data.address || ""),
      sanitizeCell(data.notes || ""),
      sanitizeCell(data.status || "جديد"),
      new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }),
    ];

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
    sheet.getRange(lastRow + 1, 11).setNumberFormat('#,##0 "د.ج"');

    console.log("✅ تم حفظ الطلب: " + data.orderNumber + " في الصف " + (lastRow + 1));

    return sendResponse({
      status: "success",
      message: "تم حفظ بيانات الطلب بنجاح",
      row: lastRow + 1,
      sheetId: sheetId,
    });
  } catch (err) {
    console.error("❌ خطأ في حفظ الطلب: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  المرحلة 2: رفع ملف واحد إلى جوجل درايف
// ═══════════════════════════════════════════════════════════════════════════
function handleUploadFile(data, sheetId, driveFolderId) {
  try {
    console.log("📁 رفع ملف: " + (data.fileName || "unknown") + " في المجلد: " + driveFolderId);

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      var fileUrl = saveFileToDrive(
        data.fileData,
        data.fileName || "upload",
        data.fileMimeType || "application/octet-stream",
        data.orderNumber,
        driveFolderId
      );

      console.log("✅ تم رفع الملف: " + fileUrl);

      return sendResponse({
        status: "success",
        message: "تم رفع الملف بنجاح",
        fileUrl: fileUrl,
        fileName: data.fileName,
        fileType: data.fileType,
        driveFolderId: driveFolderId,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error("❌ خطأ في رفع الملف: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  المرحلة 3: تحديث روابط الملفات في الشيت
// ═══════════════════════════════════════════════════════════════════════════
function handleUpdateFileUrls(data, sheetId) {
  try {
    console.log("🔗 تحديث روابط الملفات للطلب: " + data.orderNumber);

    var sheet = getSheet(sheetId);
    var row = findRowByOrderNumber(sheet, data.orderNumber);

    if (row === 0) {
      return sendResponse({ status: "error", message: "لم يتم العثور على الطلب في الشيت" });
    }

    if (data.printFileUrl) {
      try {
        var safeUrl = data.printFileUrl.replace(/"/g, "");
        sheet.getRange(row, 13).setFormula('=HYPERLINK("' + safeUrl + '", "📎 فتح ملف الطباعة")');
      } catch (e) {
        sheet.getRange(row, 13).setValue(data.printFileUrl);
      }
    }

    if (data.receiptFileUrl) {
      try {
        var safeUrl2 = data.receiptFileUrl.replace(/"/g, "");
        sheet.getRange(row, 15).setFormula('=HYPERLINK("' + safeUrl2 + '", "📎 فتح وصل التحويل")');
      } catch (e) {
        sheet.getRange(row, 15).setValue(data.receiptFileUrl);
      }
    }

    console.log("✅ تم تحديث الروابط للطلب: " + data.orderNumber);

    return sendResponse({ status: "success", message: "تم تحديث روابط الملفات" });
  } catch (err) {
    console.error("❌ خطأ في تحديث الروابط: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  الطريقة القديمة: مزامنة كاملة
// ═══════════════════════════════════════════════════════════════════════════
function handleFullSync(data, sheetId, driveFolderId) {
  try {
    console.log("📦 مزامنة كاملة للطلب: " + data.orderNumber);
    var driveLinks = {};

    if (data.printFileData && data.saveToDrive) {
      try {
        driveLinks.printFileUrl = saveFileToDrive(data.printFileData, data.printFileName || "print-file", data.printFileMime || "application/pdf", data.orderNumber, driveFolderId);
        console.log("✅ ملف الطباعة: " + driveLinks.printFileUrl);
      } catch (driveErr) {
        console.error("❌ خطأ ملف الطباعة: " + driveErr.toString());
      }
    }

    if (data.receiptFileData && data.saveToDrive) {
      try {
        driveLinks.receiptFileUrl = saveFileToDrive(data.receiptFileData, data.receiptFileName || "receipt-file", data.receiptFileMime || "image/jpeg", data.orderNumber, driveFolderId);
        console.log("✅ وصل التحويل: " + driveLinks.receiptFileUrl);
      } catch (driveErr) {
        console.error("❌ خطأ وصل التحويل: " + driveErr.toString());
      }
    }

    saveToSheet(data, driveLinks, sheetId);

    return sendResponse({ status: "success", message: "تم حفظ الطلب والملفات بنجاح", driveLinks: driveLinks });
  } catch (err) {
    console.error("❌ خطأ المزامنة: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  الدوال المساعدة
// ═══════════════════════════════════════════════════════════════════════════

function getSheet(sheetId) {
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    var headers = [
      "رقم الطلب", "الاسم الكامل", "رقم الهاتف", "عدد الصفحات",
      "حجم الورق", "طريقة الطباعة", "عدد النسخ", "نوع الألوان",
      "نوع التغليف", "طريقة الدفع", "السعر الإجمالي", "اسم ملف الطباعة",
      "رابط ملف الطباعة", "اسم وصل التحويل", "رابط وصل التحويل",
      "طريقة الاستلام", "العنوان", "ملاحظات", "الحالة", "التاريخ"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#059669");
    headerRange.setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(13, 200);
    sheet.setColumnWidth(15, 200);
    sheet.setColumnWidth(17, 200);
    sheet.setColumnWidth(20, 150);

    sheet.getRange(2, 11, 1000, 1).setNumberFormat('#,##0 "د.ج"');
  }
}

function findRowByOrderNumber(sheet, orderNumber) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === orderNumber) return i + 1;
  }
  return 0;
}

function saveFileToDrive(base64Data, fileName, mimeType, orderNumber, driveFolderId) {
  var folder = DriveApp.getFolderById(driveFolderId);

  var orderFolder;
  var existingFolders = folder.getFoldersByName(orderNumber);
  if (existingFolders.hasNext()) {
    orderFolder = existingFolders.next();
  } else {
    orderFolder = folder.createFolder(orderNumber);
  }

  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType, fileName);
  var file = orderFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

function sanitizeCell(value) {
  if (value === null || value === undefined) return "";
  var str = String(value);
  if (/^[=+\-@]/.test(str)) return "'" + str;
  return str;
}

function saveToSheet(data, driveLinks, sheetId) {
  var sheet = getSheet(sheetId);
  ensureHeaders(sheet);

  var existingRow = findRowByOrderNumber(sheet, data.orderNumber);
  if (existingRow > 0) {
    console.log("⚠️ الطلب موجود مسبقاً: " + data.orderNumber);
    if (driveLinks.printFileUrl) {
      try { sheet.getRange(existingRow, 13).setFormula('=HYPERLINK("' + driveLinks.printFileUrl.replace(/"/g, "") + '", "📎 فتح ملف الطباعة")'); } catch (e) { sheet.getRange(existingRow, 13).setValue(driveLinks.printFileUrl); }
    }
    if (driveLinks.receiptFileUrl) {
      try { sheet.getRange(existingRow, 15).setFormula('=HYPERLINK("' + driveLinks.receiptFileUrl.replace(/"/g, "") + '", "📎 فتح وصل التحويل")'); } catch (e) { sheet.getRange(existingRow, 15).setValue(driveLinks.receiptFileUrl); }
    }
    return;
  }

  var rowData = [
    sanitizeCell(data.orderNumber), sanitizeCell(data.fullName), sanitizeCell(data.phone),
    data.pageCount, sanitizeCell(data.paperSize), sanitizeCell(data.printSide),
    data.copies, sanitizeCell(data.colorType), sanitizeCell(data.bindingType),
    sanitizeCell(data.payMethod), data.totalPrice,
    sanitizeCell(data.printFileName || ""), "",
    sanitizeCell(data.receiptFileName || ""), "",
    sanitizeCell(data.deliveryMethod), sanitizeCell(data.address || ""),
    sanitizeCell(data.notes || ""), sanitizeCell(data.status),
    new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }),
  ];

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
  sheet.getRange(lastRow + 1, 11).setNumberFormat('#,##0 "د.ج"');

  var newRow = lastRow + 1;
  if (driveLinks.printFileUrl) {
    try { sheet.getRange(newRow, 13).setFormula('=HYPERLINK("' + driveLinks.printFileUrl.replace(/"/g, "") + '", "📎 فتح ملف الطباعة")'); } catch (e) { sheet.getRange(newRow, 13).setValue(driveLinks.printFileUrl); }
  }
  if (driveLinks.receiptFileUrl) {
    try { sheet.getRange(newRow, 15).setFormula('=HYPERLINK("' + driveLinks.receiptFileUrl.replace(/"/g, "") + '", "📎 فتح وصل التحويل")'); } catch (e) { sheet.getRange(newRow, 15).setValue(driveLinks.receiptFileUrl); }
  }
}

function sendResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
