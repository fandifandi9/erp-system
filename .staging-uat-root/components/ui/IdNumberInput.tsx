"use client";

import { useState, useEffect } from "react";
import {
  formatIdDecimal,
  formatIdInteger,
  parseIdDecimal,
  parseIdInteger,
} from "@/lib/format-id-number";

type Mode = "integer" | "decimal";

type Props = {
  mode: Mode;
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  suffix?: string;
  maxDecimals?: number;
};

export default function IdNumberInput({
  mode,
  value,
  onChange,
  className = "",
  placeholder,
  suffix,
  maxDecimals = 2,
}: Props) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    if (!Number.isFinite(value) || (mode === "integer" && value === 0)) {
      setText("");
      return;
    }
    setText(
      mode === "integer" ? formatIdInteger(value) : formatIdDecimal(value, maxDecimals),
    );
  }, [value, focused, mode, maxDecimals]);

  const commit = (raw: string) => {
    const parsed = mode === "integer" ? parseIdInteger(raw) : parseIdDecimal(raw);
    if (Number.isFinite(parsed)) {
      onChange(mode === "integer" ? Math.round(parsed) : parsed);
      setText(
        mode === "integer"
          ? formatIdInteger(Math.round(parsed))
          : formatIdDecimal(parsed, maxDecimals),
      );
    } else if (!raw.trim()) {
      onChange(0);
      setText("");
    } else {
      setText(raw);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode={mode === "integer" ? "numeric" : "decimal"}
        value={text}
        placeholder={placeholder ?? (mode === "integer" ? "40.000" : "4,5")}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        className={className}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  );
}
