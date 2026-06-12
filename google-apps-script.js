/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  فضاء الطباعة الرقمية — سكريبت جوجل (Google Apps Script)
 *  ربط مع Google Sheets + Google Drive
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚡ كيف يعمل النظام:
 *  ─────────────────────────────────────────────────────────────────────────
 *  العميل يرفع الملفات من جهازه مباشرة ← لا يحتاج أي حساب جوجل
 *  الملفات تُرسل كبيانات (base64) إلى هذا السكريبت
 *  السكريبت يحفظها تلقائياً في جوجل درايف الخاص بك (التاجر)
 *  ويضع روابط الملفات في الشيت
 *
 *  بمعنى: العميل لا يحتاج حساب جوجل أبداً!
 *  الملفات تُحفظ في حسابك أنت (التاجر) تلقائياً
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
 *  ⚡ تحسينات السرعة في هذا الإصدار:
 *  - رفع الملفات بأكبر حجم ممكن في كل طلب (تقليل عدد الطلبات)
 *  - استخدام setValues بدلاً من appendRow (أسرع)
 *  - تجنب العمليات غير الضرورية
 *  - حفظ الملفات مباشرة بدون عمليات إضافية
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── الإعدادات ──────────────────────────────────────────────────────────
// ⚠️⚠️⚠️ هام: SECRET_TOKEN يجب أن يطابق تماماً قيمة SHEET_SECRET_TOKEN
// في ملف .env الخاص بالمشروع! إذا لم تتطابق، ستحصل على خطأ "رمز الأمان غير صالح"
var CONFIG = {
  // ✅ معرف شيت جوجل (من الرابط المقدّم)
  SHEET_ID: "1-NhEn-Cg02mcPeAesfzqzmsH1bFS3hR3t791ityqOMw",

  // اسم الورقة داخل الشيت
  SHEET_NAME: "الطلبات",

  // ✅ معرف مجلد جوجل درايف لحفظ الملفات (من الرابط المقدّم)
  DRIVE_FOLDER_ID: "16asJMEO7sGG9kb-Rqs2amSM0i3Z4qHEA",

  // ⚠️⚠️⚠️ هذا التوكن يجب أن يطابق SHEET_SECRET_TOKEN في ملف .env
  // القيمة الحالية مطابقة لملف .env — لا تغيرها إلا إذا غيّرت الملفين معاً
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
    var data = payload.data;

    // ⚡ التحقق من التوكن — هذا هو السبب الأكثر شيوعاً لخطأ "رمز الأمان غير صالح"
    // تأكد أن هذه القيمة تطابق SHEET_SECRET_TOKEN في ملف .env
    if (token !== CONFIG.SECRET_TOKEN) {
      console.error("❌ التوكن غير متطابق! التوكن المستلم: " + (token || "فارغ"));
      return sendResponse({ status: "error", message: "رمز الأمان غير صالح" });
    }

    // التحقق من البيانات
    if (!data || !data.orderNumber) {
      return sendResponse({ status: "error", message: "البيانات غير مكتملة" });
    }

    console.log("✅ توكن صحيح — جاري معالجة الطلب: " + data.orderNumber);

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
  });
}

// ─── حفظ ملف في جوجل درايف (حساب التاجر) ───────────────────────────────
// ⚡ العميل يرفع الملف من جهازه ← يُرسل كبيانات ← يُحفظ هنا
// ⚡ العميل لا يحتاج أي حساب جوجل
function saveFileToDrive(base64Data, fileName, mimeType, orderNumber) {
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  // إنشاء مجلد فرعي لكل طلب (تنظيم أفضل)
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

  // السماح بالوصول عبر الرابط لأي شخص (حتى التاجر يمكنه فتحه بسهولة)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

// ─── حماية من حقن الصيغ (Formula Injection Protection) ──────────────────
// أي قيمة تبدأ بـ = + - @ قد تكون صيغة خطيرة في الشيت
// نضيف فاصلة عليا ' قبلها لمنع تنفيذها كصيغة
function sanitizeCell(value) {
  if (value === null || value === undefined) return "";
  var str = String(value);
  // إذا كانت القيمة تبدأ بـ = + - @ أضف فاصلة عليا للحماية
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

// ─── حفظ البيانات في شيت جوجل ──────────────────────────────────────────
function saveToSheet(data, driveLinks) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  // إنشاء الورقة إذا لم تكن موجودة
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // إضافة عناوين الأعمدة إذا كانت الورقة فارغة
  if (sheet.getLastRow() === 0) {
    var headers = [
      "رقم الطلب",
      "الاسم الكامل",
      "رقم الهاتف",
      "عدد الصفحات",
      "حجم الورق",
      "طريقة الطباعة",
      "عدد النسخ",
      "نوع الألوان",
      "نوع التغليف",
      "طريقة الدفع",
      "السعر الإجمالي",
      "اسم ملف الطباعة",
      "رابط ملف الطباعة",
      "اسم وصل التحويل",
      "رابط وصل التحويل",
      "طريقة الاستلام",
      "العنوان",
      "ملاحظات",
      "الحالة",
      "التاريخ"
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

    // تنسيق عمود السعر الإجمالي كرقم مع عملة
    // العمود 11 = السعر الإجمالي
    var priceCol = sheet.getRange(2, 11, 1000, 1); // 1000 صف للتنسيق المسبق
    priceCol.setNumberFormat('#,##0 "د.ج"');
  }

  // إضافة صف جديد بالبيانات مع حماية من حقن الصيغ
  var rowData = [
    sanitizeCell(data.orderNumber),
    sanitizeCell(data.fullName),
    sanitizeCell(data.phone),
    data.pageCount, // رقم — لا يحتاج sanitize
    sanitizeCell(data.paperSize),
    sanitizeCell(data.printSide),
    data.copies, // رقم — لا يحتاج sanitize
    sanitizeCell(data.colorType),
    sanitizeCell(data.bindingType),
    sanitizeCell(data.payMethod),
    data.totalPrice, // رقم — يُرسل كرقم الآن (بدون "د.ج") — التنسيق في الشيت
    sanitizeCell(data.printFileName || ""),
    "", // رابط ملف الطباعة — يُضاف كصيغة HYPERLINK أدناه
    sanitizeCell(data.receiptFileName || ""),
    "", // رابط وصل التحويل — يُضاف كصيغة HYPERLINK أدناه
    sanitizeCell(data.deliveryMethod),
    sanitizeCell(data.address || ""),
    sanitizeCell(data.notes || ""),
    sanitizeCell(data.status),
    new Date().toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" }),
  ];

  // استخدام getRange + setValues بدلاً من appendRow (أسرع في Apps Script)
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);

  // تنسيق خلية السعر في الصف الجديد
  var newRow = lastRow + 1;
  sheet.getRange(newRow, 11).setNumberFormat('#,##0 "د.ج"');

  // تحويل روابط درايف إلى روابط قابلة للنقر في الشيت
  // الحماية: نتحقق أن الروابط لا تحتوي على صيغ ضارة
  if (driveLinks.printFileUrl) {
    try {
      var safePrintUrl = driveLinks.printFileUrl.replace(/"/g, ""); // إزالة علامات الاقتباس
      sheet.getRange(newRow, 13).setFormula(
        '=HYPERLINK("' + safePrintUrl + '", "📎 فتح ملف الطباعة")'
      );
    } catch (e) {
      sheet.getRange(newRow, 13).setValue(driveLinks.printFileUrl);
    }
  }
  if (driveLinks.receiptFileUrl) {
    try {
      var safeReceiptUrl = driveLinks.receiptFileUrl.replace(/"/g, ""); // إزالة علامات الاقتباس
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
