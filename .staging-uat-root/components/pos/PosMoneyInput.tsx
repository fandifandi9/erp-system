"use client";

import { useEffect, useRef, useState } from "react";
import { fmtIdNumber, parseIdNumber } from "@/lib/format-id-number";

type Props = {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: "sm" | "lg";
};

/** Format tampilan saat mengetik: hanya digit → 300.000 */
function formatWhileTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  return Number.isFinite(n) ? fmtIdNumber(n) : "";
}

export function PosMoneyInput({
  value,
  onChange,
  label,
  className = "",
  inputClassName = "",
  disabled,
  placeholder = "",
  size = "sm",
}: Props) {
  const [text, setText] = useState("");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(value > 0 ? fmtIdNumber(value) : "");
    }
  }, [value]);

  const sizeCls =
    size === "lg"
      ? "py-3.5 text-xl font-semibold"
      : "py-2 text-base";

  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      )}
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          const v = parseIdNumber(text);
          onChange(v);
          setText(v > 0 ? fmtIdNumber(v) : "");
        }}
        onChange={(e) => {
          const formatted = formatWhileTyping(e.target.value);
          setText(formatted);
          onChange(parseIdNumber(formatted));
        }}
        className={`w-full rounded-xl border border-slate-300 px-3 text-right text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 ${sizeCls} ${inputClassName}`}
      />
    </label>
  );
}
