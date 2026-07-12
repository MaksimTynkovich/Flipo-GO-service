"use client";

import { Button } from "@/components/ui/button";

type Props = {
  label: string;
  disabled: boolean;
  onStake: () => void;
};

export function StakingActionBar({ label, disabled, onStake }: Props) {
  return (
    <div className="panel p-2">
      <Button
        variant="accent"
        className="h-11 w-full rounded-xl text-sm font-bold"
        disabled={disabled}
        analyticsAction="staking_submit"
        onClick={onStake}
      >
        {label}
      </Button>
    </div>
  );
}
