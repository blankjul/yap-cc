"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
  className?: string;
}

export function Chip({ label, active, count, onClick, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors",
        active
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-muted/40 border-transparent text-muted-foreground hover:border-border hover:text-foreground",
        className
      )}
    >
      {active && <CheckIcon className="size-3 shrink-0" />}
      {label}
      {count !== undefined && (
        <span className="opacity-50 text-[10px]">{count}</span>
      )}
    </button>
  );
}
