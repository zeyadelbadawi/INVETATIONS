import type { Locale } from "@/i18n/config";

const en = {
  badge: "Staff",
  title: "Orders waiting for approval",
  lead: "Match each order to a transfer on the statement before approving. Approval switches the plan on at once.",
  empty: "No orders are waiting.",
  event: "Event",
  plan: "Plan",
  amount: "Order amount",
  egp: "{amount} EGP",
  created: "Ordered",
  references: "References sent by the customer",
  noReferences: "The customer hasn't sent a reference yet.",
  reference: "Transfer reference on the statement",
  amountSeen: "Amount seen on the statement (EGP)",
  amountHint: "Type the amount yourself; it must match the order.",
  approve: "Approve payment",
  approving: "Approving…",
  approved: "Payment approved. The plan is active.",
  conflicted: "You own this event or hold access to it, so someone else has to approve it.",
  viewOnly: "Only admins can approve payments.",
  mfaTitle: "Two-step verification needed",
  mfaBody: "Staff pages open only in a session verified with your authenticator app. Sign in again with two-step verification.",
};

export type AdminMessages = typeof en;

const ar: AdminMessages = {
  badge: "الفريق",
  title: "طلبات مستنية الموافقة",
  lead: "طابق كل طلب بتحويل في كشف الحساب قبل الموافقة. الموافقة بتشغّل الباقة فورًا.",
  empty: "مفيش طلبات مستنية.",
  event: "المناسبة",
  plan: "الباقة",
  amount: "قيمة الطلب",
  egp: "{amount} جنيه",
  created: "تاريخ الطلب",
  references: "أرقام العمليات اللي بعتها العميل",
  noReferences: "العميل لسه مابعتش رقم عملية.",
  reference: "رقم العملية في كشف الحساب",
  amountSeen: "المبلغ اللي في كشف الحساب (جنيه)",
  amountHint: "اكتب المبلغ بنفسك، ولازم يطابق الطلب.",
  approve: "وافق على الدفع",
  approving: "جاري الموافقة…",
  approved: "تمت الموافقة. الباقة اشتغلت.",
  conflicted: "المناسبة دي بتاعتك أو عندك صلاحية عليها، فلازم حد تاني يوافق.",
  viewOnly: "الموافقة على الدفع للأدمن بس.",
  mfaTitle: "محتاج تحقق بخطوتين",
  mfaBody: "صفحات الفريق بتفتح بس في جلسة متأكدة بتطبيق التحقق. سجّل دخولك تاني بالتحقق بخطوتين.",
};

const all: Record<Locale, AdminMessages> = { ar, en };

export function adminMessages(locale: Locale): AdminMessages {
  return all[locale];
}
