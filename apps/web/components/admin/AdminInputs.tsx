"use client";

import { useEffect, useState } from "react";
import { AdminInfoHint } from "@/components/admin/AdminInfoHint";
import {
  bpsToPercentInput,
  nanotonToTonInput,
  percentInputToBps,
  tonInputToNanoton,
} from "@/lib/admin-units";

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {hint ? <AdminInfoHint label={label} hint={hint} /> : null}
    </span>
  );
}

export function AdminTonField({
  label,
  valueNanoton,
  onChangeNanoton,
  hint,
  min = 0,
  step = 0.001,
  decimals = 3,
}: {
  label: string;
  valueNanoton: number;
  onChangeNanoton: (value: number) => void;
  hint?: string;
  min?: number;
  step?: number;
  decimals?: number;
}) {
  const formatted = nanotonToTonInput(valueNanoton, decimals);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatted);

  useEffect(() => {
    if (!focused) setText(formatted);
  }, [formatted, focused]);

  return (
    <label className="text-xs text-[var(--admin-muted,#8b98a8)]">
      <FieldLabel label={label} hint={hint} />
      <input
        className="admin-input mt-1"
        type="text"
        inputMode="decimal"
        min={min}
        step={step}
        value={focused ? text : formatted}
        onFocus={() => {
          setFocused(true);
          setText(formatted);
        }}
        onChange={(e) => {
          const next = e.target.value.replace(",", ".");
          setText(next);
          if (next.trim() === "" || next === "." || next.endsWith(".")) return;
          onChangeNanoton(tonInputToNanoton(next));
        }}
        onBlur={() => {
          const n = tonInputToNanoton(text);
          onChangeNanoton(n);
          setText(nanotonToTonInput(n, decimals));
          setFocused(false);
        }}
      />
    </label>
  );
}

export function AdminPercentField({
  label,
  valueBps,
  onChangeBps,
  hint,
  min = 0,
  step = 0.01,
}: {
  label: string;
  valueBps: number;
  onChangeBps: (value: number) => void;
  hint?: string;
  min?: number;
  step?: number;
}) {
  const formatted = bpsToPercentInput(valueBps);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatted);

  useEffect(() => {
    if (!focused) setText(formatted);
  }, [formatted, focused]);

  return (
    <label className="text-xs text-[var(--admin-muted,#8b98a8)]">
      <FieldLabel label={label} hint={hint} />
      <input
        className="admin-input mt-1"
        type="text"
        inputMode="decimal"
        min={min}
        step={step}
        value={focused ? text : formatted}
        onFocus={() => {
          setFocused(true);
          setText(formatted);
        }}
        onChange={(e) => {
          const next = e.target.value.replace(",", ".");
          setText(next);
          if (next.trim() === "" || next === "." || next.endsWith(".")) return;
          onChangeBps(percentInputToBps(next));
        }}
        onBlur={() => {
          const bps = percentInputToBps(text);
          onChangeBps(bps);
          setText(bpsToPercentInput(bps));
          setFocused(false);
        }}
      />
    </label>
  );
}

export function AdminIntField({
  label,
  value,
  onChange,
  hint,
  min,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  step?: number;
}) {
  return (
    <label className="text-xs text-[var(--admin-muted,#8b98a8)]">
      <FieldLabel label={label} hint={hint} />
      <input
        className="admin-input mt-1"
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function AdminFloatField({
  label,
  value,
  onChange,
  hint,
  min,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  step?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <label className="text-xs text-[var(--admin-muted,#8b98a8)]">
      <FieldLabel label={label} hint={hint} />
      <input
        className="admin-input mt-1"
        type="text"
        inputMode="decimal"
        min={min}
        step={step}
        value={focused ? text : String(value)}
        onFocus={() => {
          setFocused(true);
          setText(String(value));
        }}
        onChange={(e) => {
          const next = e.target.value.replace(",", ".");
          setText(next);
          if (next.trim() === "" || next === "." || next.endsWith(".")) return;
          const n = Number.parseFloat(next);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const n = Number.parseFloat(text.replace(",", "."));
          const next = Number.isFinite(n) ? n : 0;
          onChange(next);
          setText(String(next));
          setFocused(false);
        }}
      />
    </label>
  );
}
