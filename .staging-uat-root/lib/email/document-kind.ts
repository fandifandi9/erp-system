export type EmailDocKind =
  | "invoice"
  | "sales_order"
  | "quotation"
  | "purchase_order";

export const EMAIL_DOC_KINDS: EmailDocKind[] = [
  "invoice",
  "sales_order",
  "quotation",
  "purchase_order",
];

export function isEmailDocKind(v: string): v is EmailDocKind {
  return (EMAIL_DOC_KINDS as string[]).includes(v);
}
