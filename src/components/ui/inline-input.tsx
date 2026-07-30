"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InlineInputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Borderless input that looks like document text.
 * Shows a subtle background on hover/focus instead of a boxed border.
 */
export function InlineInput({ className, ...props }: InlineInputProps) {
  return (
    <input
      {...props}
      className={cn(
        "bg-transparent outline-none placeholder:text-muted-foreground/50",
        "hover:bg-muted/50 focus:bg-muted/30 rounded px-1 -mx-1 transition-colors",
        className
      )}
    />
  );
}
