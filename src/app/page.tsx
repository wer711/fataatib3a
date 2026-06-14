"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  FileText,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  Printer,
  MapPin,
  Phone,
  Package,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ShieldCheck,
  Truck,
  Store,
  Image as ImageIcon,
  FileCheck,
  StickyNote,
  CloudUpload,
  Check,
  FileDown,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { calculatePrice, type PriceInput, type PriceBreakdown } from "@/lib/pricing";
import { generateReceiptPDF } from "@/lib/generate-receipt";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────
interface FormData {
  fullName: string;
  phone: string;
  printFile: File | null;
  pageCount: number;
  paperSize: string;
  printSide: string;
  copies: number;
  colorType: string;
  bindingType: string;
  payMethod: string;
  receiptFile: File | null;
  deliveryMethod: string;
  address: string;
  notes: string;
}

interface FieldErrors {
  [key: string]: string;
}

interface UploadProgress {
  percent: number;
  stage: string; // e.g. "جاري رفع الملفات...", "جاري معالجة الطلب...", "جاري حفظ البيانات..."
  stageIndex: number; // 0-3 for multi-stage indicator
}

const PROGRESS_STAGES = [
  { label: "حفظ البيانات", icon: FileCheck },
  { label: "رفع ملف الطباعة", icon: CloudUpload },
  { label: "رفع الوصل", icon: CloudUpload },
  { label: "تم", icon: CheckCircle2 },
];

const STEPS = [
  { id: 1, title: "معلومات التواصل", icon: User },
  { id: 2, title: "خيارات الطباعة", icon: FileText },
  { id: 3, title: "الدفع والاستلام", icon: CreditCard },
];

const INITIAL_FORM: FormData = {
  fullName: "",
  phone: "",
  printFile: null,
  pageCount: 10,
  paperSize: "A4 - قياسي",
  printSide: "وجه واحد فقط",
  copies: 1,
  colorType: "أسود وأبيض",
  bindingType: "بدون تغليف",
  payMethod: "",
  receiptFile: null,
  deliveryMethod: "استلام من المكتبة",
  address: "",
  notes: "",
};

// ─── Main Component ──────────────────────────────────────────
export default function OrderPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(0); // 1 = forward, -1 = backward
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [successDialog, setSuccessDialog] = useState(false);
  const [errorDialog, setErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderTotalPrice, setOrderTotalPrice] = useState<number>(0);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const printFileRef = useRef<HTMLInputElement>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);

  // ─── Price Calculation ───────────────────────────────────
  const priceBreakdown: PriceBreakdown = calculatePrice({
    pageCount: form.pageCount,
    copies: form.copies,
    paperSize: form.paperSize,
    printSide: form.printSide,
    colorType: form.colorType,
    bindingType: form.bindingType,
    payMethod: form.payMethod,
    deliveryMethod: form.deliveryMethod,
  });

  // ─── Field Updater ───────────────────────────────────────
  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ─── Validation ──────────────────────────────────────────
  const validateStep = useCallback(
    (step: number): boolean => {
      const newErrors: FieldErrors = {};

      if (step === 1) {
        if (!form.fullName.trim()) newErrors.fullName = "الرجاء إدخال الاسم الكامل";
        const phoneClean = form.phone.replace(/\s/g, "");
        if (!phoneClean || !/^0\d{8,9}$/.test(phoneClean))
          newErrors.phone = "الرجاء إدخال رقم هاتف صحيح";
      }

      if (step === 2) {
        if (!form.printFile) newErrors.printFile = "الرجاء رفع ملف الطباعة";
        if (form.pageCount < 1) newErrors.pageCount = "عدد الصفحات يجب أن يكون 1 على الأقل";
      }

      if (step === 3) {
        if (!form.payMethod) newErrors.payMethod = "الرجاء اختيار طريقة الدفع";
        if (form.payMethod !== "الدفع عند الاستلام" && !form.receiptFile)
          newErrors.receiptFile = "الرجاء رفع صورة وصل التحويل";
        if (form.deliveryMethod === "توصيل للمنزل" && !form.address.trim())
          newErrors.address = "الرجاء إدخال عنوان التوصيل";
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form]
  );

  // ─── Navigation ──────────────────────────────────────────
  const goNext = useCallback(() => {
    if (validateStep(currentStep)) {
      setDirection(1); // forward
      setCurrentStep((s) => Math.min(s + 1, 3));
    }
  }, [currentStep, validateStep]);

  const goPrev = useCallback(() => {
    setDirection(-1); // backward
    setCurrentStep((s) => Math.max(s - 1, 1));
  }, []);

  // ─── File Handling ───────────────────────────────────────
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, field: "printFile" | "receiptFile") => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        toast.error("حجم الملف أكبر من 10MB", {
          description: "يرجى تصغير الملف وإعادة المحاولة",
        });
        return;
      }

      updateField(field, file);
    },
    [updateField]
  );

  const clearFile = useCallback(
    (field: "printFile" | "receiptFile") => {
      updateField(field, null);
      if (field === "printFile" && printFileRef.current) printFileRef.current.value = "";
      if (field === "receiptFile" && receiptFileRef.current) receiptFileRef.current.value = "";
    },
    [updateField]
  );

  // ─── Download Order Receipt as PDF ────────────────────────
  const downloadOrderPDF = useCallback(async () => {
    if (!orderNumber) return;
    setIsGeneratingPDF(true);

    try {
      await generateReceiptPDF({
        orderNumber,
        fullName: form.fullName,
        phone: form.phone,
        pageCount: form.pageCount,
        paperSize: form.paperSize,
        printSide: form.printSide,
        copies: form.copies,
        colorType: form.colorType,
        bindingType: form.bindingType,
        payMethod: form.payMethod,
        deliveryMethod: form.deliveryMethod,
        address: form.address,
        notes: form.notes,
        totalPrice: orderTotalPrice,
        printFileName: form.printFile?.name || null,
      });
      toast.success("تم تنزيل إيصال PDF!");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("حدث خطأ في إنشاء الإيصال");
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [orderNumber, form, orderTotalPrice]);

  // ─── Submit with multi-step progress ──────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validateStep(3)) return;

    // Check network connectivity before making the request
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setErrorMessage("لا يوجد اتصال بالإنترنت. يرجى التحقق من شبكتك والمحاولة مرة أخرى.");
      setErrorDialog(true);
      return;
    }

    setIsSubmitting(true);
    setUploadProgress({ percent: 5, stage: "جاري حفظ بيانات الطلب...", stageIndex: 0 });

    try {
      // ═══════════════════════════════════════════════════════════
      // المرحلة 1: إرسال بيانات الطلب (JSON فقط — بدون ملفات)
      // ═══════════════════════════════════════════════════════════
      const orderPayload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        pageCount: form.pageCount,
        paperSize: form.paperSize,
        printSide: form.printSide,
        copies: form.copies,
        colorType: form.colorType,
        bindingType: form.bindingType,
        payMethod: form.payMethod,
        deliveryMethod: form.deliveryMethod,
        address: form.address.trim(),
        notes: form.notes.trim(),
        hasPrintFile: !!form.printFile,
        printFileName: form.printFile?.name || null,
        hasReceiptFile: !!form.receiptFile && form.payMethod !== "الدفع عند الاستلام",
        receiptFileName: form.payMethod !== "الدفع عند الاستلام" ? form.receiptFile?.name || null : null,
      };

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      // Safely parse JSON — handle HTML error pages from Next.js
      let orderResult: Record<string, unknown>;
      try {
        const text = await orderRes.text();
        orderResult = JSON.parse(text);
      } catch {
        console.error("❌ Non-JSON response from /api/orders, status:", orderRes.status);
        setErrorMessage("حدث خطأ في الخادم. يرجى المحاولة مرة أخرى.");
        setErrorDialog(true);
        return;
      }

      if (!orderResult || (orderResult as Record<string, unknown>).status !== "success") {
        const rawError = ((orderResult as Record<string, unknown>)?.error as string) || "حدث خطأ غير متوقع";
        let friendlyError = rawError;
        if (rawError.includes("EROFS") || rawError.includes("read-only") || rawError.includes("ENOENT") || rawError.includes("no such file")) {
          friendlyError = "حدث خطأ في حفظ الملف. يرجى المحاولة مرة أخرى.";
        } else if (rawError.includes("ECONNREFUSED") || rawError.includes("Failed to fetch") || rawError.includes("fetch failed")) {
          friendlyError = "تعذر الاتصال بالخادم. يرجى المحاولة لاحقاً.";
        } else if (rawError.includes("429") || rawError.includes("طلبات كثيرة")) {
          friendlyError = "طلبات كثيرة جداً. يرجى الانتظار قليلاً ثم المحاولة.";
        }
        setErrorMessage(friendlyError);
        setErrorDialog(true);
        return;
      }

      const newOrderNumber = (orderResult.order as Record<string, unknown>)?.orderNumber as string;
      const newTotalPrice = (orderResult.order as Record<string, unknown>)?.totalPrice as number;
      setOrderNumber(newOrderNumber);
      setOrderTotalPrice(newTotalPrice);

      setUploadProgress({ percent: 25, stage: "تم حفظ البيانات بنجاح!", stageIndex: 0 });

      // ═══════════════════════════════════════════════════════════
      // المرحلة 2: رفع ملف الطباعة (إن وجد)
      // ═══════════════════════════════════════════════════════════
      if (form.printFile && orderResult.pendingFiles?.printFile) {
        setUploadProgress({ percent: 30, stage: "جاري رفع ملف الطباعة...", stageIndex: 1 });

        const printFormData = new FormData();
        printFormData.append("orderNumber", newOrderNumber);
        printFormData.append("fileType", "print");
        printFormData.append("file", form.printFile);

        try {
          const printRes = await fetch("/api/upload-file", {
            method: "POST",
            body: printFormData,
          });
          // Safely parse JSON — handle HTML error pages
          let printResult: Record<string, unknown> | null = null;
          try {
            const text = await printRes.text();
            printResult = JSON.parse(text);
          } catch {
            console.error("⚠️ Print file upload: non-JSON response, status:", printRes.status);
          }
          if (printResult) {
            console.log(`📎 Print file upload: ${printResult.status}`, printResult.fileName || "");
          }
        } catch (printErr) {
          console.error("⚠️ Print file upload failed (order is still saved):", printErr);
        }

        setUploadProgress({ percent: 60, stage: "تم رفع ملف الطباعة!", stageIndex: 1 });
      } else {
        // No print file to upload
        setUploadProgress({ percent: 60, stage: "لا يوجد ملف طباعة للرفع", stageIndex: 1 });
      }

      // ═══════════════════════════════════════════════════════════
      // المرحلة 3: رفع وصل التحويل (إن وجد)
      // ═══════════════════════════════════════════════════════════
      if (form.receiptFile && form.payMethod !== "الدفع عند الاستلام" && orderResult.pendingFiles?.receiptFile) {
        setUploadProgress({ percent: 65, stage: "جاري رفع وصل التحويل...", stageIndex: 2 });

        const receiptFormData = new FormData();
        receiptFormData.append("orderNumber", newOrderNumber);
        receiptFormData.append("fileType", "receipt");
        receiptFormData.append("file", form.receiptFile);

        try {
          const receiptRes = await fetch("/api/upload-file", {
            method: "POST",
            body: receiptFormData,
          });
          // Safely parse JSON — handle HTML error pages
          let receiptResult: Record<string, unknown> | null = null;
          try {
            const text = await receiptRes.text();
            receiptResult = JSON.parse(text);
          } catch {
            console.error("⚠️ Receipt file upload: non-JSON response, status:", receiptRes.status);
          }
          if (receiptResult) {
            console.log(`📎 Receipt file upload: ${receiptResult.status}`, receiptResult.fileName || "");
          }
        } catch (receiptErr) {
          console.error("⚠️ Receipt file upload failed (order is still saved):", receiptErr);
        }

        setUploadProgress({ percent: 90, stage: "تم رفع وصل التحويل!", stageIndex: 2 });
      } else {
        // No receipt file to upload
        setUploadProgress({ percent: 90, stage: "تم حفظ البيانات!", stageIndex: 2 });
      }

      // ═══════════════════════════════════════════════════════════
      // تم بنجاح!
      // ═══════════════════════════════════════════════════════════
      setUploadProgress({ percent: 100, stage: "تم بنجاح!", stageIndex: 3 });
      setTimeout(() => setSuccessDialog(true), 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.";
      setErrorMessage(msg);
      setErrorDialog(true);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  }, [form, validateStep]);

  // ─── Reset Form ──────────────────────────────────────────
  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setErrors({});
    setCurrentStep(1);
    setSuccessDialog(false);
    setErrorDialog(false);
    setOrderNumber("");
    setOrderTotalPrice(0);
    setUploadProgress(null);
    if (printFileRef.current) printFileRef.current.value = "";
    if (receiptFileRef.current) receiptFileRef.current.value = "";
  }, []);

  // ─── Animation Variants ──────────────────────────────────
  // RTL: forward (direction > 0) = slide from right, backward (direction < 0) = slide from left
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80, // forward: enter from right, backward: enter from left
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir > 0 ? -80 : 80, // forward: exit to left, backward: exit to right
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-emerald-600 via-teal-600 to-emerald-700 dark:from-emerald-800 dark:via-teal-800 dark:to-emerald-900" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 left-10 w-32 h-32 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-10 right-1/3 w-24 h-24 rounded-full bg-white/15 blur-2xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Printer className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white">
                فضاء الطباعة الرقمية
              </h1>
            </div>
            <p className="text-base sm:text-lg text-emerald-100 max-w-2xl mx-auto leading-relaxed">
              أرسل تفاصيل طلبك بسهولة واختر جميع خيارات الطباعة والتغليف والدفع.
              سيتم حساب السعر تلقائياً وحفظ طلبك مباشرةً وسنتواصل معك فوراً.
            </p>
          </motion.div>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Step Indicator */}
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Form Area */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-none dark:border dark:border-slate-800 rounded-2xl overflow-hidden">
              <CardContent className="p-5 sm:p-8">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentStep}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                  >
                    {currentStep === 1 && (
                      <Step1Contact
                        form={form}
                        errors={errors}
                        updateField={updateField}
                      />
                    )}
                    {currentStep === 2 && (
                      <Step2Printing
                        form={form}
                        errors={errors}
                        updateField={updateField}
                        handleFileSelect={handleFileSelect}
                        clearFile={clearFile}
                        printFileRef={printFileRef}
                      />
                    )}
                    {currentStep === 3 && (
                      <Step3Payment
                        form={form}
                        errors={errors}
                        updateField={updateField}
                        handleFileSelect={handleFileSelect}
                        clearFile={clearFile}
                        receiptFileRef={receiptFileRef}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  {currentStep > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goPrev}
                      disabled={isSubmitting}
                      className="gap-2 rounded-xl px-6 h-11 min-w-[80px]"
                    >
                      <ChevronRight className="w-4 h-4" />
                      السابق
                    </Button>
                  ) : (
                    <div />
                  )}

                  {currentStep < 3 ? (
                    <Button
                      type="button"
                      onClick={goNext}
                      className="gap-2 rounded-xl px-6 h-11 min-w-[80px] bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-600/25"
                    >
                      التالي
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="gap-2 rounded-xl px-8 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-600/25 h-12 text-base font-bold min-w-[200px]"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          جاري الإرسال...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          تأكيد وإرسال الطلب
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* Upload Progress Bar — Multi-Stage */}
                <AnimatePresence>
                  {uploadProgress && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 space-y-4"
                    >
                      {/* Stage indicators */}
                      <div className="flex items-center justify-between gap-1">
                        {PROGRESS_STAGES.map((stage, i) => {
                          const isCompleted = uploadProgress.stageIndex > i;
                          const isActive = uploadProgress.stageIndex === i;
                          const StageIcon = stage.icon;
                          return (
                            <div key={i} className="flex items-center gap-1 flex-1">
                              <div className="flex flex-col items-center gap-1 flex-1">
                                <motion.div
                                  animate={{
                                    scale: isActive ? 1.15 : 1,
                                    backgroundColor: isCompleted
                                      ? "#059669"
                                      : isActive
                                      ? "#0d9488"
                                      : "#e2e8f0",
                                  }}
                                  className="w-8 h-8 rounded-full flex items-center justify-center"
                                >
                                  {isCompleted ? (
                                    <Check className="w-4 h-4 text-white" />
                                  ) : (
                                    <StageIcon className={`w-4 h-4 ${isActive ? "text-white animate-pulse" : "text-slate-400"}`} />
                                  )}
                                </motion.div>
                                <span className={`text-[10px] font-bold text-center leading-tight ${
                                  isCompleted ? "text-emerald-600" : isActive ? "text-teal-600" : "text-slate-400"
                                }`}>
                                  {stage.label}
                                </span>
                              </div>
                              {i < PROGRESS_STAGES.length - 1 && (
                                <div className={`h-0.5 w-full rounded-full mt-[-12px] ${
                                  isCompleted ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                                }`} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                          <CloudUpload className="w-4 h-4 animate-pulse" />
                          {uploadProgress.stage}
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                          {uploadProgress.percent}%
                        </span>
                      </div>
                      <Progress value={uploadProgress.percent} className="h-3 rounded-full" />
                      <p className="text-xs text-muted-foreground text-center">
                        يرجى الانتظار وعدم إغلاق الصفحة حتى يكتمل الرفع...
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>

          {/* Price Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <PriceSummary form={form} breakdown={priceBreakdown} />
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} فضاء الطباعة الرقمية — جميع الحقوق محفوظة
        </div>
      </footer>

      {/* ── Success Dialog ────────────────────────────────── */}
      <Dialog open={successDialog} onOpenChange={(open) => {
        if (!open) {
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-md rounded-2xl text-center">
          <DialogHeader className="items-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </motion.div>
            <DialogTitle className="text-2xl font-extrabold">تم إرسال طلبك بنجاح!</DialogTitle>
            <DialogDescription className="text-base leading-relaxed mt-2">
              سيتم مراجعة طلبك من قبل فريقنا. سيتم التواصل معك قريباً على رقم الواتساب المدخل لتأكيد الطلب.
            </DialogDescription>
          </DialogHeader>

          {/* Order Number Section */}
          {orderNumber && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-5 mt-4 space-y-2">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">رقم الطلب</p>
              <p className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-200 font-mono tracking-wider">
                {orderNumber}
              </p>
            </div>
          )}

          {/* Action Buttons: Download + Copy Link */}
          {orderNumber && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={downloadOrderPDF}
                disabled={isGeneratingPDF}
                className="h-11 rounded-xl border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 gap-2 text-sm font-bold"
              >
                {isGeneratingPDF ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                {isGeneratingPDF ? "جاري الإنشاء..." : "نسخ / PDF"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const link = `${window.location.origin}?order=${orderNumber}`;
                  navigator.clipboard.writeText(link).catch(() => {});
                  toast.success("تم نسخ الرابط!");
                }}
                className="h-11 rounded-xl border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 gap-2 text-sm font-bold"
              >
                <Link2 className="w-4 h-4" />
                نسخ الرابط
              </Button>
            </div>
          )}

          {/* Important Note */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mt-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed text-right">
              <p className="font-bold mb-1">ملاحظة هامة</p>
              <p>احتفظ برقم الطلب للمطالبة به عند الاستلام. لا تقم بتكرار الطلب إذا لم تتوصل برسالة تأكيد فوراً — سيتم مراجعة طلبك والتواصل معك في أقرب وقت.</p>
            </div>
          </div>

          {/* Total Price */}
          {orderTotalPrice > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 mt-2">
              <span className="text-sm font-bold text-muted-foreground">المبلغ الإجمالي</span>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {orderTotalPrice} د.ج
              </span>
            </div>
          )}

          <Button
            onClick={resetForm}
            className="mt-4 w-full rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white h-12 text-base font-bold"
          >
            إغلاق رسالة التأكيد
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Error Dialog ──────────────────────────────────── */}
      <Dialog open={errorDialog} onOpenChange={setErrorDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl text-center">
          <DialogHeader className="items-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mx-auto mb-4"
            >
              <AlertCircle className="w-12 h-12 text-red-600" />
            </motion.div>
            <DialogTitle className="text-2xl font-extrabold text-red-600">حدث خطأ في الإرسال</DialogTitle>
            <DialogDescription className="text-base leading-relaxed mt-2">
              {errorMessage || "يرجى المحاولة مرة أخرى أو التواصل معنا مباشرة."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 space-y-3">
            <Button
              onClick={() => {
                setErrorDialog(false);
                // Retry submission after a short delay
                setTimeout(() => handleSubmit(), 300);
              }}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white h-12 text-base font-bold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin ml-2" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <CloudUpload className="w-5 h-5 ml-2" />
                  إعادة المحاولة
                </>
              )}
            </Button>
            <Button
              onClick={() => setErrorDialog(false)}
              variant="outline"
              className="w-full rounded-xl h-12 text-base font-bold"
            >
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Step Indicator ────────────────────────────────────────
function StepIndicator({ steps, currentStep }: { steps: typeof STEPS; currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((step, i) => {
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;
        const Icon = step.icon;

        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: isActive ? 1.1 : 1,
                  backgroundColor: isDone
                    ? "#059669"
                    : isActive
                    ? "#0d9488"
                    : "#e2e8f0",
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors"
              >
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-white" />
                ) : (
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                )}
              </motion.div>
              <span
                className={`text-sm font-bold hidden sm:inline ${
                  isActive
                    ? "text-teal-700 dark:text-teal-400"
                    : isDone
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {step.title}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 w-8 sm:w-16 rounded-full transition-colors ${
                  currentStep > step.id ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Section Title ─────────────────────────────────────────
function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-xl bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
        <Icon className="w-5 h-5 text-teal-700 dark:text-teal-400" />
      </div>
      <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100">
        {title}
      </h2>
    </div>
  );
}

// ─── Field Wrapper ─────────────────────────────────────────
function FieldWrapper({
  label,
  required,
  error,
  children,
  note,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </Label>
      {children}
      {note && !error && (
        <p className="text-xs text-muted-foreground leading-relaxed">{note}</p>
      )}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-red-500 font-medium flex items-center gap-1"
        >
          <AlertCircle className="w-3 h-3" />
          {error}
        </motion.p>
      )}
    </div>
  );
}

// ─── Option Card ───────────────────────────────────────────
function OptionCard({
  name,
  value,
  checked,
  onChange,
  icon,
  title,
  desc,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onChange}
      className={`relative cursor-pointer rounded-2xl border-2 p-4 transition-all ${
        checked
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600 shadow-md shadow-emerald-200/50 dark:shadow-none"
          : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <div className="flex items-start gap-3">
        <div className="text-2xl mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div
            className={`font-bold text-sm ${
              checked ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
            }`}
          >
            {title}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
        </div>
      </div>
      {checked && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 left-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── File Upload Zone (with progress) ──────────────────────
function FileUploadZone({
  file,
  error,
  onFileSelect,
  onClear,
  fileRef,
  accept,
  icon,
  title,
  subtitle,
  id,
}: {
  file: File | null;
  error?: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  id: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [fileReady, setFileReady] = useState(false);

  // Simulate file reading progress when a file is selected
  useEffect(() => {
    if (file) {
      setFileReady(false);
      setIsReading(true);
      setReadProgress(0);

      const sizeMB = file.size / (1024 * 1024);
      const duration = Math.min(1500, Math.max(400, sizeMB * 300)); // faster for small files
      const steps = 20;
      const interval = duration / steps;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        const progress = Math.min(100, Math.round((step / steps) * 100));
        setReadProgress(progress);
        if (step >= steps) {
          clearInterval(timer);
          setIsReading(false);
          setFileReady(true);
        }
      }, interval);

      return () => clearInterval(timer);
    } else {
      setReadProgress(0);
      setIsReading(false);
      setFileReady(false);
    }
  }, [file]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      if (fileRef.current) {
        fileRef.current.files = dt.files;
        fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };

  const fileSize = file
    ? file.size > 1024 * 1024
      ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
      : (file.size / 1024).toFixed(0) + " KB"
    : "";

  // Get file extension icon color
  const getFileColor = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400";
    if (["doc", "docx"].includes(ext || "")) return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
    if (["ppt", "pptx"].includes(ext || "")) return "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400";
    return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400";
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        ref={fileRef}
        id={id}
        accept={accept}
        onChange={onFileSelect}
        className="hidden"
      />
      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 scale-[1.02]"
              : error
              ? "border-red-300 bg-red-50/50 dark:bg-red-900/10"
              : "border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <motion.div
              animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
              className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center"
            >
              {icon}
            </motion.div>
            <h3 className="font-bold text-emerald-800 dark:text-emerald-300">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden"
        >
          {/* File info row */}
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getFileColor(file.name)}`}>
              {fileReady ? (
                <FileCheck className="w-5 h-5" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 truncate">
                {file.name}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{fileSize}</p>
                {fileReady && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    جاهز للرفع
                  </motion.span>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Reading progress bar */}
          {isReading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 pb-3 pt-1 bg-emerald-50/50 dark:bg-emerald-900/10"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  جاري قراءة الملف...
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                  {readProgress}%
                </span>
              </div>
              <Progress value={readProgress} className="h-1.5 rounded-full" />
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Step 1: Contact Info ──────────────────────────────────
function Step1Contact({
  form,
  errors,
  updateField,
}: {
  form: FormData;
  errors: FieldErrors;
  updateField: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionTitle icon={User} title="معلومات التواصل" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldWrapper
          label="الاسم الكامل"
          required
          error={errors.fullName}
          note="يرجى كتابة الاسم الكامل لضمان وضعه على الطلبية"
        >
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={form.fullName}
              onChange={(e) => updateField("fullName", e.target.value)}
              placeholder="أدخل الاسم الثلاثي"
              className={`rounded-xl h-12 pr-10 text-sm ${errors.fullName ? "border-red-400 focus-visible:ring-red-400" : ""}`}
            />
          </div>
        </FieldWrapper>

        <FieldWrapper
          label="رقم الهاتف / واتساب"
          required
          error={errors.phone}
          note="سيتم التواصل معك عند انتهاء تجهيز الطلب"
        >
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="0555 00 00 00"
              className={`rounded-xl h-12 pr-10 text-sm ${errors.phone ? "border-red-400 focus-visible:ring-red-400" : ""}`}
              dir="ltr"
            />
          </div>
        </FieldWrapper>
      </div>
    </div>
  );
}

// ─── Step 2: Print Options ─────────────────────────────────
function Step2Printing({
  form,
  errors,
  updateField,
  handleFileSelect,
  clearFile,
  printFileRef,
}: {
  form: FormData;
  errors: FieldErrors;
  updateField: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>, field: "printFile" | "receiptFile") => void;
  clearFile: (field: "printFile" | "receiptFile") => void;
  printFileRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-8">
      <SectionTitle icon={FileText} title="خيارات الطباعة" />

      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
          الحد الأقصى لحجم الملف: <strong>10 ميجابايت</strong>. يفضل رفع الملفات بصيغة PDF
          للحفاظ على جودة التنسيق.
        </div>
      </div>

      {/* File Upload */}
      <FieldWrapper label="رفع الملفات المطلوبة" required error={errors.printFile}>
        <FileUploadZone
          file={form.printFile}
          error={errors.printFile}
          onFileSelect={(e) => handleFileSelect(e, "printFile")}
          onClear={() => clearFile("printFile")}
          fileRef={printFileRef}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"
          icon={<Upload className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
          title="اسحب الملف هنا أو اضغط للرفع"
          subtitle="PDF — Word — PowerPoint — صور (حد أقصى 10MB)"
          id="printFileInput"
        />
      </FieldWrapper>

      {/* Page Count, Paper Size, Print Side, Copies */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FieldWrapper label="عدد الصفحات (تقريبي)" required error={errors.pageCount}>
          <Input
            type="number"
            min={1}
            value={form.pageCount}
            onChange={(e) => updateField("pageCount", parseInt(e.target.value) || 1)}
            className="rounded-xl h-12 text-sm"
          />
        </FieldWrapper>

        <FieldWrapper label="حجم الورق">
          <select
            value={form.paperSize}
            onChange={(e) => updateField("paperSize", e.target.value)}
            className="w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="A4 - قياسي">A4 - قياسي</option>
            <option value="A3 - كبير">A3 - كبير</option>
            <option value="A5 - صغير">A5 - صغير</option>
          </select>
        </FieldWrapper>

        <FieldWrapper label="طريقة الطباعة">
          <select
            value={form.printSide}
            onChange={(e) => updateField("printSide", e.target.value)}
            className="w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="وجه واحد فقط">وجه واحد فقط</option>
            <option value="على الوجهين">على الوجهين</option>
          </select>
        </FieldWrapper>

        <FieldWrapper label="عدد النسخ">
          <Input
            type="number"
            min={1}
            value={form.copies}
            onChange={(e) => updateField("copies", parseInt(e.target.value) || 1)}
            className="rounded-xl h-12 text-sm"
          />
        </FieldWrapper>
      </div>

      {/* Color Type */}
      <FieldWrapper label="نوع الألوان" required error={errors.colorType}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionCard
            name="colorType"
            value="أسود وأبيض"
            checked={form.colorType === "أسود وأبيض"}
            onChange={() => updateField("colorType", "أسود وأبيض")}
            icon="🖤"
            title="أسود وأبيض"
            desc="خيار اقتصادي مناسب للمذكرات والبحوث."
          />
          <OptionCard
            name="colorType"
            value="ملون"
            checked={form.colorType === "ملون"}
            onChange={() => updateField("colorType", "ملون")}
            icon="🎨"
            title="ملون"
            desc="طباعة عالية الجودة للملفات والعروض."
          />
        </div>
      </FieldWrapper>

      {/* Binding Type */}
      <FieldWrapper label="نوع التغليف" required error={errors.bindingType}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OptionCard
            name="bindingType"
            value="بدون تغليف"
            checked={form.bindingType === "بدون تغليف"}
            onChange={() => updateField("bindingType", "بدون تغليف")}
            icon="📎"
            title="بدون تغليف"
            desc="تدبيس مجاني فقط."
          />
          <OptionCard
            name="bindingType"
            value="تغليف سلكي"
            checked={form.bindingType === "تغليف سلكي"}
            onChange={() => updateField("bindingType", "تغليف سلكي")}
            icon="🌀"
            title="تغليف سلكي"
            desc="مناسب للبحوث والمذكرات."
          />
          <OptionCard
            name="bindingType"
            value="تغليف حراري"
            checked={form.bindingType === "تغليف حراري"}
            onChange={() => updateField("bindingType", "تغليف حراري")}
            icon="📘"
            title="تغليف حراري"
            desc="شكل احترافي للمشاريع والتقارير."
          />
        </div>
      </FieldWrapper>
    </div>
  );
}

// ─── Step 3: Payment & Delivery ────────────────────────────
function Step3Payment({
  form,
  errors,
  updateField,
  handleFileSelect,
  clearFile,
  receiptFileRef,
}: {
  form: FormData;
  errors: FieldErrors;
  updateField: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>, field: "printFile" | "receiptFile") => void;
  clearFile: (field: "printFile" | "receiptFile") => void;
  receiptFileRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-8">
      <SectionTitle icon={CreditCard} title="الدفع والاستلام" />

      {/* Payment Method */}
      <FieldWrapper label="طريقة الدفع" required error={errors.payMethod}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OptionCard
            name="payMethod"
            value="بريدي موب"
            checked={form.payMethod === "بريدي موب"}
            onChange={() => updateField("payMethod", "بريدي موب")}
            icon="📱"
            title="بريدي موب"
            desc="تحويل سريع وآمن عبر التطبيق."
          />
          <OptionCard
            name="payMethod"
            value="CCP"
            checked={form.payMethod === "CCP"}
            onChange={() => updateField("payMethod", "CCP")}
            icon="🏦"
            title="CCP"
            desc="تحويل بريدي تقليدي."
          />
          <OptionCard
            name="payMethod"
            value="الدفع عند الاستلام"
            checked={form.payMethod === "الدفع عند الاستلام"}
            onChange={() => updateField("payMethod", "الدفع عند الاستلام")}
            icon="💵"
            title="الدفع عند الاستلام"
            desc="للطلبات السريعة والصغيرة."
          />
        </div>
      </FieldWrapper>

      {/* Receipt Upload (shown only for non-cash payments) */}
      <AnimatePresence>
        {form.payMethod && form.payMethod !== "الدفع عند الاستلام" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <FieldWrapper
              label="صورة وصل التحويل"
              required
              error={errors.receiptFile}
              note="يرجى رفع صورة واضحة لوصل التحويل لتأكيد الدفع"
            >
              <FileUploadZone
                file={form.receiptFile}
                error={errors.receiptFile}
                onFileSelect={(e) => handleFileSelect(e, "receiptFile")}
                onClear={() => clearFile("receiptFile")}
                fileRef={receiptFileRef}
                accept=".jpg,.jpeg,.png,.pdf,.webp"
                icon={<ImageIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
                title="اسحب الصورة هنا أو اضغط للرفع"
                subtitle="JPG — PNG — PDF (حد أقصى 10MB)"
                id="receiptFileInput"
              />
            </FieldWrapper>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delivery Method */}
      <FieldWrapper label="طريقة الاستلام" required error={errors.deliveryMethod}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionCard
            name="deliveryMethod"
            value="استلام من المكتبة"
            checked={form.deliveryMethod === "استلام من المكتبة"}
            onChange={() => updateField("deliveryMethod", "استلام من المكتبة")}
            icon="🏪"
            title="استلام من المكتبة"
            desc="مجاني — استلم طلبك مباشرة من المكتبة."
          />
          <OptionCard
            name="deliveryMethod"
            value="توصيل للمنزل"
            checked={form.deliveryMethod === "توصيل للمنزل"}
            onChange={() => updateField("deliveryMethod", "توصيل للمنزل")}
            icon="🛵"
            title="توصيل للمنزل"
            desc="+80 د.ج — توصيل سريع لباب المنزل."
          />
        </div>
      </FieldWrapper>

      {/* Address (shown only for home delivery) */}
      <AnimatePresence>
        {form.deliveryMethod === "توصيل للمنزل" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <FieldWrapper
              label="عنوان التوصيل"
              required
              error={errors.address}
              note="اكتب العنوان بالتفصيل مع رقم العمارة إن وجد"
            >
              <div className="relative">
                <MapPin className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                <Textarea
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="اكتب عنوانك التفصيلي هنا..."
                  className={`rounded-xl pr-10 min-h-[80px] text-sm resize-none ${errors.address ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
              </div>
            </FieldWrapper>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes */}
      <FieldWrapper label="ملاحظات إضافية" note="أي تفاصيل أخرى تريد إضافتها لطلبك">
        <div className="relative">
          <StickyNote className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
          <Textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="ملاحظات إضافية (اختياري)..."
            className="rounded-xl pr-10 min-h-[60px] text-sm resize-none"
          />
        </div>
      </FieldWrapper>
    </div>
  );
}

// ─── Price Summary ─────────────────────────────────────────
function PriceSummary({
  form,
  breakdown,
}: {
  form: FormData;
  breakdown: PriceBreakdown;
}) {
  const hasFile = form.printFile !== null;
  const hasReceipt = form.receiptFile !== null;

  return (
    <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-none dark:border dark:border-slate-800 rounded-2xl overflow-hidden sticky top-6">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-white" />
          <h3 className="text-lg font-extrabold text-white">ملخص الطلب</h3>
        </div>
      </div>

      <CardContent className="p-5 space-y-4">
        {/* Line items */}
        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">سعر الصفحة</span>
            <span className="font-bold">{breakdown.unitPrice} د.ج</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {form.pageCount} صفحة × {form.copies} نسخة
            </span>
            <span className="font-bold">{breakdown.subtotal} د.ج</span>
          </div>
          {breakdown.discount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>خصم الدفع الإلكتروني (10%)</span>
              <span className="font-bold">-{breakdown.discount} د.ج</span>
            </div>
          )}
          {breakdown.bindingCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">التغليف ({form.bindingType})</span>
              <span className="font-bold">{breakdown.bindingCost} د.ج</span>
            </div>
          )}
          {breakdown.deliveryCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">التوصيل</span>
              <span className="font-bold">{breakdown.deliveryCost} د.ج</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Total */}
        <div className="flex justify-between items-center">
          <span className="text-base font-extrabold">الإجمالي</span>
          <motion.span
            key={breakdown.total}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400"
          >
            {breakdown.total} د.ج
          </motion.span>
        </div>

        {/* File status badges */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            {hasFile ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1">
                <CheckCircle2 className="w-3 h-3" />
                ملف الطباعة مرفق
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground gap-1">
                <Upload className="w-3 h-3" />
                لم يُرفع ملف
              </Badge>
            )}
          </div>
          {form.payMethod && form.payMethod !== "الدفع عند الاستلام" && (
            <div className="flex items-center gap-2">
              {hasReceipt ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  وصل التحويل مرفق
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
                  <AlertCircle className="w-3 h-3" />
                  يلزم رفع وصل التحويل
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Discount hint */}
        {form.payMethod !== "بريدي موب" && form.payMethod !== "CCP" && (
          <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
            <p className="text-xs text-teal-700 dark:text-teal-300 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              ادفع ببريدي موب أو CCP واحصل على خصم 10%
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
