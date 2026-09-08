"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useValidatorWorkstationSession,
  type ValidatorWorkstationSessionApi,
} from "@/lib/wms/use-validator-workstation-session";

const Ctx = createContext<ValidatorWorkstationSessionApi | null>(null);

export function ValidatorWorkstationProvider({ children }: { children: ReactNode }) {
  const api = useValidatorWorkstationSession();
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useValidatorWorkstationApi(): ValidatorWorkstationSessionApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useValidatorWorkstationApi must be used within ValidatorWorkstationProvider");
  }
  return ctx;
}

/** Optional — null di luar provider (mis. tab picking). */
export function useOptionalValidatorWorkstationApi(): ValidatorWorkstationSessionApi | null {
  return useContext(Ctx);
}
