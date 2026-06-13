/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  فضاء الطباعة الرقمية — سكريبت جوجل (Google Apps Script)
 *  ربط مع Google Sheets + Google Drive
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚡ كيف يعمل النظام (النسخة الجديدة — متوافقة مع Netlify):
 *  ─────────────────────────────────────────────────────────────────────────
 *  النظام يعمل بـ 3 مراحل منفصلة (لتجنب timeout على Netlify):
 *
 *  المرحلة 1: saveOrder — حفظ بيانات الطلب في الشيت (سريع ~3 ثواني)
 *  المرحلة 2: uploadFile — رفع ملف واحد إلى جوجل درايف (~5 ثواني)
 *  المرحلة 3: updateFileUrls — تحديث الشيت بروابط الملفات (~2 ثانية)
 *
 *  النظام القديم (إرسال كل شيء في طلب واحد) لا يزال مدعوماً للتوافق العكسي
 *  ─────────────────────────────────────────────────────────────────────────
 *
 *  📋 تعليمات النشر خطوة بخطوة:
 *  ─────────────────────────────────────────────────────────────────────────
 *  1. افتح Google Apps Script: https://script.google.com
 *  2. أنشئ مشروع جديد أو عدّل المشروع الحالي
 *  3. الصق هذا الكود بالكامل (استبدل أي كود قديم)
 *  4. ⚠️ تأكد أن قيمة SECRET_TOKEN أدناه تطابق تماماً
 *     قيمة SHEET_SECRET_TOKEN في ملف .env
 *  5. اضغط "نشر" → "نشر كتطبيق ويب"
 *     - وصف الإصدار: اكتب أي وصف مثل "الإصدار الجديد"
 *     - تنفيذ باسم: أنا (أي حساب التاجر) ← ⚠️ مهم جداً!
 *     - من يمكنه الوصول: أي شخص
 *  6. اضغط "نشر" وانتظر
 *  7. إذا طلب "التفويض" → اضغط "مراجعة الأذونات" → اختر حسابك → متابعة → سماح
 *  8. انسخ رابط التطبيق الذي يظهر
 *  9. ضع الرابط في ملف .env بعد GOOGLE_SCRIPT_URL=
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── الإعدادات ──────────────────────────────────────────────────────────
// ⚠️⚠️⚠️ هام: SECRET_TOKEN يجب أن يطابق تماماً قيمة SHEET_SECRET_TOKEN
// في ملف .env الخاص بالمشروع! إذا لم تتطابق، ستحصل على خطأ "رمز الأمان غير صالح"
var CONFIG = {
  // ✅ معرف شيت جوجل
  SHEET_ID: "1-NhEn-Cg02mcPeAesfzqzmsH1bFS3hR3t791ityqOMw",

  // اسم الورقة داخل الشيت
  SHEET_NAME: "الطلبات",

  // ✅ معرف مجلد جوجل درايف لحفظ الملفات
  DRIVE_FOLDER_ID: "16asJMEO7sGG9kb-Rqs2amSM0i3Z4qHEA",

  // ⚠️⚠️⚠️ هذا التوكن يجب أن يطابق SHEET_SECRET_TOKEN في ملف .env
  SECRET_TOKEN: "ffc0b9b5959d4a9149eed95327b88f02b1c6ee8b64a723d2",
};

// ─── معالجة طلبات POST ──────────────────────────────────────────────────
function doPost(e) {
  try {
    // التحقق من وجود بيانات
    if (!e || !e.postData || !e.postData.contents) {
      return sendResponse({ status: "error", message: "لا توجد بيانات" });
    }

    // تحليل البيانات الواردة
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return sendResponse({ status: "error", message: "بيانات غير صالحة: " + parseErr.toString() });
    }

    var token = payload._token;
    var action = payload.action || "saveOrder"; // default action
    var data = payload.data;

    // ⚡ التحقق من التوكن
    if (token !== CONFIG.SECRET_TOKEN) {
      console.error("❌ التوكن غير متطابق! التوكن المستلم: " + (token || "فارغ"));
      return sendResponse({ status: "error", message: "رمز الأمان غير صالح" });
    }

    console.log("✅ توكن صحيح — الإجراء: " + action);

    // ─── توجيه الإجراءات ─────────────────────────────────────────────
    switch (action) {

      // ── المرحلة 1: حفظ بيانات الطلب فقط (بدون ملفات) ──────────
      case "saveOrder":
        if (!data || !data.orderNumber) {
          return sendResponse({ status: "error", message: "البيانات غير مكتملة" });
        }
        return handleSaveOrder(data);

      // ── المرحلة 2: رفع ملف واحد إلى جوجل درايف ──────────────
      case "uploadFile":
        if (!data || !data.orderNumber || !data.fileData) {
          return sendResponse({ status: "error", message: "بيانات الملف غير مكتملة" });
        }
        return handleUploadFile(data);

      // ── المرحلة 3: تحديث روابط الملفات في الشيت ──────────────
      case "updateFileUrls":
        if (!data || !data.orderNumber) {
          return sendResponse({ status: "error", message: "بيانات التحديث غير مكتملة" });
        }
        return handleUpdateFileUrls(data);

      // ── الطريقة القديمة: إرسال كل شيء في طلب واحد (للتوافق) ──
      case "fullSync":
      default:
        if (!data || !data.orderNumber) {
          return sendResponse({ status: "error", message: "البيانات غير مكتملة" });
        }
        return handleFullSync(data);
    }
  } catch (error) {
    console.error("❌ خطأ عام في معالجة الطلب: " + error.toString());
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
    tokenConfigured: CONFIG.SECRET_TOKEN ? true : false,
    actions: ["saveOrder", "uploadFile", "updateFileUrls", "fullSync"],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  المرحلة 1: حفظ بيانات الطلب في الشيت (سريع — بدون ملفات)
// ═══════════════════════════════════════════════════════════════════════════
function handleSaveOrder(data) {
  try {
    console.log("📝 حفظ بيانات الطلب: " + data.orderNumber);

    var sheet = getSheet();
    ensureHeaders(sheet);

    // التحقق من عدم وجود طلب بنفس الرقم (منع التكرار)
    var existingRow = findRowByOrderNumber(sheet, data.orderNumber);
    if (existingRow > 0) {
      console.log("⚠️ الطلب موجود مسبقاً: " + data.orderNumber + " في الصف " + existingRow);
      return sendResponse({
        status: "success",
        message: "الطلب موجود مسبقاً",
        row: existingRow,
      });
    }

    // إضافة صف جديد بالبيانات
    var rowData = [
      sanitizeCell(data.orderNumber),   // 1 - رقم الطلب
      sanitizeCell(data.fullName),      // 2 - الاسم الكامل
      sanitizeCell(data.phone),         // 3 - رقم الهاتف
      data.pageCount,                   // 4 - عدد الصفحات
      sanitizeCell(data.paperSize),     // 5 - حجم الورق
      sanitizeCell(data.printSide),     // 6 - طريقة الطباعة
      data.copies,                      // 7 - عدد النسخ
      sanitizeCell(data.colorType),     // 8 - نوع الألوان
      sanitizeCell(data.bindingType),   // 9 - نوع التغليف
      sanitizeCell(data.payMethod),     // 10 - طريقة الدفع
      data.totalPrice,                  // 11 - السعر الإجمالي
      sanitizeCell(data.printFileName || ""),  // 12 - اسم ملف الطباعة
      "",                               // 13 - رابط ملف الطباعة (يُضاف لاحقاً)
      sanitizeCell(data.receiptFileName || ""), // 14 - اسم وصل التحويل
      "",                               // 15 - رابط وصل التحويل (يُضاف لاحقاً)
      sanitizeCell(data.deliveryMethod),// 16 - طريقة الاستلام
      sanitizeCell(data.address || ""), // 17 - العنوان
      sanitizeCell(data.notes || ""),   // 18 - ملاحظات
      sanitizeCell(data.status || "جديد"), // 19 - الحالة
      new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }), // 20 - التاريخ
    ];

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);

    // تنسيق خلية السعر
    sheet.getRange(lastRow + 1, 11).setNumberFormat('#,##0 "د.ج"');

    console.log("✅ تم حفظ بيانات الطلب: " + data.orderNumber + " في الصف " + (lastRow + 1));

    return sendResponse({
      status: "success",
      message: "تم حفظ بيانات الطلب بنجاح",
      row: lastRow + 1,
    });
  } catch (err) {
    console.error("❌ خطأ في حفظ الطلب: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  المرحلة 2: رفع ملف واحد إلى جوجل درايف
// ═══════════════════════════════════════════════════════════════════════════
function handleUploadFile(data) {
  try {
    console.log("📁 رفع ملف: " + (data.fileName || "unknown") + " للطلب: " + data.orderNumber);

    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // انتظار حتى 30 ثانية

    try {
      var fileUrl = saveFileToDrive(
        data.fileData,
        data.fileName || "upload",
        data.fileMimeType || "application/octet-stream",
        data.orderNumber
      );

      console.log("✅ تم رفع الملف: " + fileUrl);

      return sendResponse({
        status: "success",
        message: "تم رفع الملف بنجاح",
        fileUrl: fileUrl,
        fileName: data.fileName,
        fileType: data.fileType, // "print" أو "receipt"
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
function handleUpdateFileUrls(data) {
  try {
    console.log("🔗 تحديث روابط الملفات للطلب: " + data.orderNumber);

    var sheet = getSheet();
    var row = findRowByOrderNumber(sheet, data.orderNumber);

    if (row === 0) {
      console.error("❌ لم يتم العثور على الطلب: " + data.orderNumber);
      return sendResponse({ status: "error", message: "لم يتم العثور على الطلب في الشيت" });
    }

    // تحديث رابط ملف الطباعة (العمود 13)
    if (data.printFileUrl) {
      try {
        var safeUrl = data.printFileUrl.replace(/"/g, "");
        sheet.getRange(row, 13).setFormula(
          '=HYPERLINK("' + safeUrl + '", "📎 فتح ملف الطباعة")'
        );
      } catch (e) {
        sheet.getRange(row, 13).setValue(data.printFileUrl);
      }
    }

    // تحديث رابط وصل التحويل (العمود 15)
    if (data.receiptFileUrl) {
      try {
        var safeUrl2 = data.receiptFileUrl.replace(/"/g, "");
        sheet.getRange(row, 15).setFormula(
          '=HYPERLINK("' + safeUrl2 + '", "📎 فتح وصل التحويل")'
        );
      } catch (e) {
        sheet.getRange(row, 15).setValue(data.receiptFileUrl);
      }
    }

    console.log("✅ تم تحديث روابط الملفات للطلب: " + data.orderNumber);

    return sendResponse({
      status: "success",
      message: "تم تحديث روابط الملفات",
    });
  } catch (err) {
    console.error("❌ خطأ في تحديث الروابط: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  الطريقة القديمة: إرسال كل شيء في طلب واحد (للتوافق العكسي)
// ═══════════════════════════════════════════════════════════════════════════
function handleFullSync(data) {
  try {
    console.log("📦 مزامنة كاملة للطلب: " + data.orderNumber);

    // حفظ الملفات في جوجل درايف
    var driveLinks = {};

    // رفع ملف الطباعة
    if (data.printFileData && data.saveToDrive) {
      try {
        var printUrl = saveFileToDrive(
          data.printFileData,
          data.printFileName || "print-file",
          data.printFileMime || "application/pdf",
          data.orderNumber
        );
        driveLinks.printFileUrl = printUrl;
        console.log("✅ تم رفع ملف الطباعة: " + printUrl);
      } catch (driveErr) {
        console.error("❌ خطأ في حفظ ملف الطباعة في درايف: " + driveErr.toString());
      }
    }

    // رفع وصل التحويل
    if (data.receiptFileData && data.saveToDrive) {
      try {
        var receiptUrl = saveFileToDrive(
          data.receiptFileData,
          data.receiptFileName || "receipt-file",
          data.receiptFileMime || "image/jpeg",
          data.orderNumber
        );
        driveLinks.receiptFileUrl = receiptUrl;
        console.log("✅ تم رفع وصل التحويل: " + receiptUrl);
      } catch (driveErr) {
        console.error("❌ خطأ في حفظ وصل التحويل في درايف: " + driveErr.toString());
      }
    }

    // حفظ البيانات في شيت جوجل
    saveToSheet(data, driveLinks);

    console.log("✅ تم حفظ الطلب بنجاح: " + data.orderNumber);

    return sendResponse({
      status: "success",
      message: "تم حفظ الطلب والملفات بنجاح",
      driveLinks: driveLinks,
    });
  } catch (err) {
    console.error("❌ خطأ في المزامنة الكاملة: " + err.toString());
    return sendResponse({ status: "error", message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  الدوال المساعدة
// ═══════════════════════════════════════════════════════════════════════════

// ─── الحصول على ورقة الشيت ──────────────────────────────────────────────
function getSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  // إنشاء الورقة إذا لم تكن موجودة
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  return sheet;
}

// ─── إضافة عناوين الأعمدة إذا كانت الورقة فارغة ──────────────────────────
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    var headers = [
      "رقم الطلب",        // 1
      "الاسم الكامل",     // 2
      "رقم الهاتف",       // 3
      "عدد الصفحات",      // 4
      "حجم الورق",        // 5
      "طريقة الطباعة",    // 6
      "عدد النسخ",        // 7
      "نوع الألوان",      // 8
      "نوع التغليف",      // 9
      "طريقة الدفع",      // 10
      "السعر الإجمالي",   // 11
      "اسم ملف الطباعة",  // 12
      "رابط ملف الطباعة", // 13
      "اسم وصل التحويل",  // 14
      "رابط وصل التحويل", // 15
      "طريقة الاستلام",   // 16
      "العنوان",          // 17
      "ملاحظات",          // 18
      "الحالة",           // 19
      "التاريخ"           // 20
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // تنسيق العناوين
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#059669");
    headerRange.setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);

    // تعيين عرض الأعمدة
    sheet.setColumnWidth(1, 150);  // رقم الطلب
    sheet.setColumnWidth(2, 180);  // الاسم
    sheet.setColumnWidth(3, 130);  // الهاتف
    sheet.setColumnWidth(13, 200); // رابط ملف الطباعة
    sheet.setColumnWidth(15, 200); // رابط وصل التحويل
    sheet.setColumnWidth(17, 200); // العنوان
    sheet.setColumnWidth(20, 150); // التاريخ

    // تنسيق عمود السعر الإجمالي
    var priceCol = sheet.getRange(2, 11, 1000, 1);
    priceCol.setNumberFormat('#,##0 "د.ج"');
  }
}

// ─── البحث عن صف بالرقم المرجعي للطلب ──────────────────────────────────
function findRowByOrderNumber(sheet, orderNumber) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0; // لا توجد بيانات بعد العناوين

  var data = sheet.getRange(1, 1, lastRow, 1).getValues(); // العمود الأول = رقم الطلب
  for (var i = 1; i < data.length; i++) { // نبدأ من 1 لتخطي العناوين
    if (data[i][0] === orderNumber) {
      return i + 1; // رقم الصف (مؤشر + 1)
    }
  }
  return 0; // لم يتم العثور عليه
}

// ─── حفظ ملف في جوجل درايف ──────────────────────────────────────────────
function saveFileToDrive(base64Data, fileName, mimeType, orderNumber) {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  // إنشاء مجلد فرعي لكل طلب
  var orderFolder;
  var existingFolders = folder.getFoldersByName(orderNumber);
  if (existingFolders.hasNext()) {
    orderFolder = existingFolders.next();
  } else {
    orderFolder = folder.createFolder(orderNumber);
  }

  // فك تشفير base64 وتحويله إلى ملف
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType, fileName);

  // رفع الملف إلى جوجل درايف
  var file = orderFolder.createFile(blob);

  // السماح بالوصول عبر الرابط لأي شخص
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

// ─── حماية من حقن الصيغ ─────────────────────────────────────────────────
function sanitizeCell(value) {
  if (value === null || value === undefined) return "";
  var str = String(value);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

// ─── حفظ البيانات في الشيت (الطريقة القديمة) ───────────────────────────
function saveToSheet(data, driveLinks) {
  var sheet = getSheet();
  ensureHeaders(sheet);

  // التحقق من التكرار
  var existingRow = findRowByOrderNumber(sheet, data.orderNumber);
  if (existingRow > 0) {
    console.log("⚠️ الطلب موجود مسبقاً: " + data.orderNumber);
    // تحديث الروابط فقط
    if (driveLinks.printFileUrl) {
      try {
        var safeUrl = driveLinks.printFileUrl.replace(/"/g, "");
        sheet.getRange(existingRow, 13).setFormula(
          '=HYPERLINK("' + safeUrl + '", "📎 فتح ملف الطباعة")'
        );
      } catch (e) {
        sheet.getRange(existingRow, 13).setValue(driveLinks.printFileUrl);
      }
    }
    if (driveLinks.receiptFileUrl) {
      try {
        var safeUrl2 = driveLinks.receiptFileUrl.replace(/"/g, "");
        sheet.getRange(existingRow, 15).setFormula(
          '=HYPERLINK("' + safeUrl2 + '", "📎 فتح وصل التحويل")'
        );
      } catch (e) {
        sheet.getRange(existingRow, 15).setValue(driveLinks.receiptFileUrl);
      }
    }
    return;
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
    sanitizeCell(data.status),
    new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }),
  ];

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
  sheet.getRange(lastRow + 1, 11).setNumberFormat('#,##0 "د.ج"');

  var newRow = lastRow + 1;

  if (driveLinks.printFileUrl) {
    try {
      var safePrintUrl = driveLinks.printFileUrl.replace(/"/g, "");
      sheet.getRange(newRow, 13).setFormula(
        '=HYPERLINK("' + safePrintUrl + '", "📎 فتح ملف الطباعة")'
      );
    } catch (e) {
      sheet.getRange(newRow, 13).setValue(driveLinks.printFileUrl);
    }
  }
  if (driveLinks.receiptFileUrl) {
    try {
      var safeReceiptUrl = driveLinks.receiptFileUrl.replace(/"/g, "");
      sheet.getRange(newRow, 15).setFormula(
        '=HYPERLINK("' + safeReceiptUrl + '", "📎 فتح وصل التحويل")'
      );
    } catch (e) {
      sheet.getRange(newRow, 15).setValue(driveLinks.receiptFileUrl);
    }
  }
}

// ─── إرسال الاستجابة ────────────────────────────────────────────────────
function sendResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
