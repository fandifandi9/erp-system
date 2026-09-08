import type { PosCart, PosPaymentDraft, PosSession } from "@/lib/pos/types";

const SESSION_KEY = "pos_session_v1";
const CART_KEY = "pos_cart_v1";
const PAYMENT_KEY = "pos_payment_v1";

export function loadPosSession(): PosSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosSession;
  } catch {
    return null;
  }
}

export function savePosSession(session: PosSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearPosSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(PAYMENT_KEY);
}

export function loadPosPayment(): PosPaymentDraft {
  if (typeof window === "undefined") return { payAmount: 0 };
  try {
    const raw = localStorage.getItem(PAYMENT_KEY);
    if (!raw) return { payAmount: 0 };
    return JSON.parse(raw) as PosPaymentDraft;
  } catch {
    return { payAmount: 0 };
  }
}

export function savePosPayment(draft: PosPaymentDraft): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAYMENT_KEY, JSON.stringify(draft));
}

export function loadPosCart(): PosCart {
  if (typeof window === "undefined") return { lines: [], discountAmount: 0 };
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { lines: [], discountAmount: 0 };
    const parsed = JSON.parse(raw) as PosCart;
    return {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      discountAmount: Number(parsed.discountAmount) || 0,
    };
  } catch {
    return { lines: [], discountAmount: 0 };
  }
}

export function savePosCart(cart: PosCart): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearPosCart(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(PAYMENT_KEY);
}
