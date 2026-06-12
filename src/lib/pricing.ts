// Pricing configuration for digital printing
export const PRICING = {
  basePrice: { bank: 7, cash: 10 },
  paperSize: { "A5 - صغير": 0.6, "A4 - قياسي": 1, "A3 - كبير": 2 },
  printSide: { "وجه واحد فقط": 1, "على الوجهين": 1.8 },
  color: { "أسود وأبيض": 1, "ملون": 4 },
  binding: { "بدون تغليف": 0, "تغليف سلكي": 15, "تغليف حراري": 25 },
  delivery: { "استلام من المكتبة": 0, "توصيل للمنزل": 80 },
  bankDiscount: 0.10,
} as const;

export interface PriceInput {
  pageCount: number;
  copies: number;
  paperSize: string;
  printSide: string;
  colorType: string;
  bindingType: string;
  payMethod: string;
  deliveryMethod: string;
}

export interface PriceBreakdown {
  unitPrice: number;
  subtotal: number;
  discount: number;
  bindingCost: number;
  deliveryCost: number;
  total: number;
  totalPages: number;
}

export function calculatePrice(input: PriceInput): PriceBreakdown {
  const isCash = input.payMethod === "الدفع عند الاستلام";
  let unitPrice = isCash ? PRICING.basePrice.cash : PRICING.basePrice.bank;

  unitPrice *= PRICING.paperSize[input.paperSize as keyof typeof PRICING.paperSize] || 1;
  unitPrice *= PRICING.printSide[input.printSide as keyof typeof PRICING.printSide] || 1;
  unitPrice *= PRICING.color[input.colorType as keyof typeof PRICING.color] || 1;

  const totalPages = input.pageCount * input.copies;
  const subtotal = unitPrice * totalPages;

  let discount = 0;
  if (input.payMethod === "بريدي موب" || input.payMethod === "CCP") {
    discount = subtotal * PRICING.bankDiscount;
  }

  const bindingCost =
    (PRICING.binding[input.bindingType as keyof typeof PRICING.binding] || 0) *
    input.copies;
  const deliveryCost =
    PRICING.delivery[input.deliveryMethod as keyof typeof PRICING.delivery] || 0;

  const total = Math.round(subtotal - discount + bindingCost + deliveryCost);

  return {
    unitPrice: Math.round(unitPrice),
    subtotal: Math.round(subtotal),
    discount: Math.round(discount),
    bindingCost,
    deliveryCost,
    total,
    totalPages,
  };
}
