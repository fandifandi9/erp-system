"use client";

import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { focusNextField } from "@/lib/bisnis/form-nav";

const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);
const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(/,/g, ".")) || 0;

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  className?: string;
  inputClassName?: string;
  suffix?: string;
  disabled?: boolean;
  "data-nav"?: string;
  onEnterNext?: () => void;
};

export function NumSpinnerInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  decimals = 0,
  className = "",
  inputClassName = "",
  suffix,
  disabled,
  "data-nav": dataNav,
  onEnterNext,
}: Props) {
  const [text, setText] = useState(value ? fmtNum(value) : "");
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) {
      setText(value ? fmtNum(decimals > 0 ? Number(value.toFixed(decimals)) : value) : "");
    }
  }, [value, decimals]);

  const clamp = (n: number) => {
    let v = decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n);
    if (v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  };

  const apply = (n: number) => {
    const v = clamp(n);
    onChange(v);
    if (!focused.current) setText(v ? fmtNum(v) : "");
  };

  const bump = (dir: 1 | -1) => {
    apply((value || 0) + dir * step);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (onEnterNext) onEnterNext();
      else if (inputRef.current) focusNextField(inputRef.current);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      bump(1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      bump(-1);
    }
  };

  return (
    <div className={`flex items-stretch ${className}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        data-nav={dataNav}
        value={text}
        onFocus={() => { focused.current = true; }}
        onBlur={() => {
          focused.current = false;
          const v = clamp(parseNum(text));
          onChange(v);
          setText(v ? fmtNum(v) : "");
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseNum(e.target.value);
          if (e.target.value === "" || !Number.isNaN(parsed)) {
            onChange(clamp(parsed));
          }
        }}
        onKeyDown={handleKeyDown}
        className={`min-w-0 flex-1 rounded-l border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none disabled:bg-slate-50 ${inputClassName}`}
      />
      <div className="flex flex-col border border-l-0 border-slate-200 rounded-r overflow-hidden">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => bump(1)}
          className="flex flex-1 items-center justify-center px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => bump(-1)}
          className="flex flex-1 items-center justify-center border-t border-slate-200 px-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      {suffix ? <span className="ml-0.5 self-center text-xs text-slate-400">{suffix}</span> : null}
    </div>
  );
}

export { fmtNum, parseNum };
