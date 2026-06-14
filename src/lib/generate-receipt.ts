import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

interface ReceiptData {
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
  deliveryMethod: string;
  address: string;
  notes: string;
  totalPrice: number;
  printFileName?: string | null;
}

/**
 * Generates a professional Arabic PDF receipt using html2canvas + jsPDF.
 * This approach renders the receipt as HTML (perfect RTL/Arabic support via browser)
 * then converts it to a PDF document.
 */
export async function generateReceiptPDF(data: ReceiptData): Promise<void> {
  // Create a temporary container for the receipt HTML
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "595px"; // A4 width at 72dpi
  container.style.backgroundColor = "#ffffff";
  container.style.fontFamily = "Segoe UI, Tahoma, Arial, sans-serif";
  container.style.direction = "rtl";
  container.style.zIndex = "-9999";

  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-DZ", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("ar-DZ", {
    timeZone: "Africa/Algiers",
    hour: "2-digit",
    minute: "2-digit",
  });

  container.innerHTML = `
    <div style="padding: 40px 35px; color: #1e293b; font-size: 14px; line-height: 1.7;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #059669;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: #059669; border-radius: 14px; margin-bottom: 12px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </div>
        <h1 style="font-size: 26px; font-weight: 800; color: #059669; margin: 0 0 4px 0;">فضاء الطباعة الرقمية</h1>
        <p style="font-size: 15px; color: #64748b; margin: 0;">إيصال تأكيد الطلب</p>
      </div>

      <!-- Order Number Box -->
      <div style="background: #ecfdf5; border: 2px solid #059669; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 28px;">
        <p style="font-size: 13px; font-weight: 700; color: #047857; margin: 0 0 6px 0;">رقم الطلب</p>
        <p style="font-size: 24px; font-weight: 800; color: #065f46; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 2px; direction: ltr;">${data.orderNumber}</p>
      </div>

      <!-- Date & Time -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; color: #64748b;">
        <span>📅 ${dateStr}</span>
        <span>🕐 ${timeStr}</span>
      </div>

      <!-- Section: Contact Info -->
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 700; color: #0f766e; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">👤 معلومات التواصل</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 120px; font-size: 13px;">الاسم الكامل</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.fullName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">رقم الهاتف</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px; direction: ltr; text-align: right;">${data.phone}</td>
          </tr>
        </table>
      </div>

      <!-- Section: Print Options -->
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 700; color: #0f766e; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">🖨️ تفاصيل الطباعة</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 120px; font-size: 13px;">عدد الصفحات</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.pageCount}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">حجم الورق</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.paperSize}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">طريقة الطباعة</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.printSide}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">عدد النسخ</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.copies}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">نوع الألوان</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.colorType}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">نوع التغليف</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.bindingType}</td>
          </tr>
          ${data.printFileName ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">ملف الطباعة</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.printFileName}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- Section: Payment & Delivery -->
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 700; color: #0f766e; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">💳 الدفع والاستلام</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 120px; font-size: 13px;">طريقة الدفع</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.payMethod}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">طريقة الاستلام</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.deliveryMethod}</td>
          </tr>
          ${data.address ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">العنوان</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.address}</td>
          </tr>
          ` : ''}
          ${data.notes ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">ملاحظات</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${data.notes}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- Total Price -->
      <div style="background: #f0fdf4; border: 2px solid #059669; border-radius: 12px; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <span style="font-size: 17px; font-weight: 800; color: #065f46;">المبلغ الإجمالي</span>
        <span style="font-size: 26px; font-weight: 800; color: #059669;">${data.totalPrice.toLocaleString("ar-DZ")} د.ج</span>
      </div>

      <!-- Important Note -->
      <div style="background: #fffbeb; border: 1px solid #f59e0b; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;">
        <p style="font-size: 13px; font-weight: 700; color: #92400e; margin: 0 0 6px 0;">⚠️ ملاحظة هامة</p>
        <p style="font-size: 12px; color: #78350f; margin: 0; line-height: 1.8;">
          احتفظ برقم الطلب للمطالبة به عند الاستلام. بدون رقم الطلب لن تتمكن من استلام طلبك.
          لا تقم بتكرار الطلب إذا لم تتوصل برسالة تأكيد فوراً — سيتم مراجعة طلبك والتواصل معك في أقرب وقت.
        </p>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding-top: 16px; border-top: 2px solid #e2e8f0;">
        <p style="font-size: 13px; color: #059669; font-weight: 700; margin: 0 0 4px 0;">شكراً لثقتكم بنا — فضاء الطباعة الرقمية</p>
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">هذا الإيصال تم إنشاؤه تلقائياً بتاريخ ${dateStr} على الساعة ${timeStr}</p>
      </div>
    </div>
  `;

  // Append to body so html2canvas can render it
  document.body.appendChild(container);

  try {
    // Wait a tick for the browser to render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Render HTML to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: 595,
    });

    // Create PDF
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    // If the receipt fits in one page, center it; otherwise span pages
    if (imgHeight <= pdfHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      // Multi-page support
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
    }

    // Save the PDF
    pdf.save(`إيصال-${data.orderNumber}.pdf`);
  } finally {
    // Clean up
    document.body.removeChild(container);
  }
}
