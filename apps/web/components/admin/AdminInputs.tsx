"use client";

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
  step = 0.01,
  decimals = 2,
}: {
  label: string;
  valueNanoton: number;
  onChangeNanoton: (value: number) => void;
  hint?: string;
  min?: number;
  step?: number;
  decimals?: number;
}) {
  return (
    <label className="text-xs text-muted">
      <FieldLabel label={label} hint={hint} />
      <input
        className="input-field mt-1"
        type="number"
        min={min}
        step={step}
        value={nanotonToTonInput(valueNanoton, decimals)}
        onChange={(e) => onChangeNanoton(tonInputToNanoton(e.target.value))}
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
  return (
    <label className="text-xs text-muted">
      <FieldLabel label={label} hint={hint} />
      <input
        className="input-field mt-1"
        type="number"
        min={min}
        step={step}
        value={bpsToPercentInput(valueBps)}
        onChange={(e) => onChangeBps(percentInputToBps(e.target.value))}
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
    <label className="text-xs text-muted">
      <FieldLabel label={label} hint={hint} />
      <input
        className="input-field mt-1"
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
  return (
    <label className="text-xs text-muted">
      <FieldLabel label={label} hint={hint} />
      <input
        className="input-field mt-1"
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
