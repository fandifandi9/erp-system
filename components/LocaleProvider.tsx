"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "en" ? "en" : "id";
}

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
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const applyServerLocale = useCallback((next: Locale) => {
    if (next !== "id" && next !== "en") return;
    if (next === localeRef.current) {
      writeStoredLocale(next);
      applyDocumentLocale(next);
      return;
    }
    setLocaleState(next);
    writeStoredLocale(next);
    applyDocumentLocale(next);
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    let wasValid = pb.authStore.isValid;

    const run = () => {
      void (async () => {
        if (!pb.authStore.isValid) return;
        try {
          const res = await fetch("/api/user/locale", { credentials: "include" });
          if (cancelled || !res.ok) return;
          const json = (await res.json()) as { locale?: Locale };
          if (cancelled) return;
          if (json.locale === "id" || json.locale === "en") {
            applyServerLocale(json.locale);
          }
        } catch {
          /* optional */
        }
      })();
    };

    run();

    // Hanya sync ulang saat login/logout — bukan tiap authStore.save (session refresh).
    const unsub = pb.authStore.onChange(() => {
      if (cancelled) return;
      const nowValid = pb.authStore.isValid;
      if (nowValid === wasValid) return;
      wasValid = nowValid;
      if (nowValid) run();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [applyServerLocale]);

  const setLocale = useCallback(async (next: Locale) => {
    applyServerLocale(next);
    try {
      const res = await fetch("/api/user/locale", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      /* local preference still applies */
    }
  }, [applyServerLocale]);

  const t = useMemo(() => createTranslator(locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
