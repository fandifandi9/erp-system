"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createTranslator, type Locale } from "@/lib/i18n";
import { readStoredLocale, writeStoredLocale } from "@/lib/i18n/storage";
import { pb } from "@/lib/pocketbase";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: ReturnType<typeof createTranslator>;
};

const Ctx = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const v = useContext(Ctx);
  if (!v) {
    const locale = readStoredLocale();
    return { locale, setLocale: async () => {}, t: createTranslator(locale) };
  }
  return v;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/locale", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { locale?: Locale };
        if (!cancelled && (json.locale === "id" || json.locale === "en")) {
          setLocaleState(json.locale);
          writeStoredLocale(json.locale);
        }
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    try {
      await fetch("/api/user/locale", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      /* local still works */
    }
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
