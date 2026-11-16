import type { Locale } from "@/i18n/config";

// Host-side strings for card payments (kept apart from messages.ts).

export type CardCheckoutError = "card_unavailable" | "card_failed" | "no_pending_order" | "already_paid" | "forbidden" | "unauthenticated";

const en = {
  cardTitle: "Pay by card",
  cardLead: "Pay securely on our payment partner's page. Your plan switches on as soon as the payment is confirmed.",
  cardButton: "Pay {amount} EGP by card",
  cardRedirecting: "Opening the payment page…",
  orTransfer: "Or pay by transfer",
  confirming: "We're confirming your payment. This page updates on its own — it usually takes less than a minute.",
  confirmed: "Payment confirmed. Your plan is active.",
  stillWaiting:
    "We haven't received the confirmation yet. If money left your account, it will be matched shortly — you don't need to pay again. Refresh this page in a few minutes.",
  errors: {
    card_unavailable: "Card payment isn't available right now. Please pay by transfer.",
    card_failed: "We couldn't open the payment page. Please try again or pay by transfer.",
    no_pending_order: "Choose a plan first.",
    already_paid: "This event already has a paid plan.",
    forbidden: "Only the event owner can pay.",
    unauthenticated: "Please sign in again.",
  } satisfies Record<CardCheckoutError, string>,
};

export type PaymentMessages = typeof en;

const ar: PaymentMessages = {
  cardTitle: "ادفع بالكارت",
  cardLead: "ادفع بأمان على صفحة شريك الدفع بتاعنا. الباقة بتشتغل أول ما الدفع يتأكد.",
  cardButton: "ادفع {amount} جنيه بالكارت",
  cardRedirecting: "بنفتح صفحة الدفع…",
  orTransfer: "أو ادفع بالتحويل",
  confirming: "بنأكد الدفع. الصفحة دي هتتحدث لوحدها — غالبًا في أقل من دقيقة.",
  confirmed: "الدفع اتأكد. الباقة اشتغلت.",
  stillWaiting: "لسه ماوصلناش التأكيد. لو الفلوس اتخصمت هتتطابق قريب — مش محتاج تدفع تاني. حدّث الصفحة بعد كام دقيقة.",
  errors: {
    card_unavailable: "الدفع بالكارت مش متاح دلوقتي. ادفع بالتحويل لو سمحت.",
    card_failed: "ماقدرناش نفتح صفحة الدفع. جرّب تاني أو ادفع بالتحويل.",
    no_pending_order: "اختار باقة الأول.",
    already_paid: "المناسبة دي عليها باقة مدفوعة بالفعل.",
    forbidden: "صاحب المناسبة بس اللي يقدر يدفع.",
    unauthenticated: "سجّل دخولك تاني لو سمحت.",
  },
};

const all: Record<Locale, PaymentMessages> = { ar, en };

export function paymentMessages(locale: Locale): PaymentMessages {
  return all[locale];
}
