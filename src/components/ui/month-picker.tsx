"use client";

import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MonthPickerProps {
  value: string; // "YYYY-MM" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  variant?: "outline" | "ghost";
}

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

function parseValue(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function formatDisplay(value: string): string | null {
  const parsed = parseValue(value);
  if (!parsed) return null;
  return `${parsed.year}. ${String(parsed.month).padStart(2, "0")}`;
}

export function MonthPicker({ value, onChange, placeholder = "선택", disabled = false, variant = "outline" }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseValue(value);
  const [viewYear, setViewYear] = useState<number>(parsed ? parsed.year : new Date().getFullYear());

  const display = formatDisplay(value);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const current = parseValue(value);
      setViewYear(current ? current.year : new Date().getFullYear());
    }
    setOpen(nextOpen);
  }

  function handleSelect(month: number) {
    onChange(`${viewYear}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant === "ghost" ? "ghost" : "outline"}
          disabled={disabled}
          className={cn(
            "justify-start font-normal",
            variant === "ghost" ? "h-auto px-1 py-0.5 -mx-1 hover:bg-muted/50" : "w-full",
            !display && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-4 mr-2" />
          {display ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이전 연도"
            onClick={() => setViewYear((y) => y - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm font-medium">{viewYear}년</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="다음 연도"
            onClick={() => setViewYear((y) => y + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, idx) => {
            const month = idx + 1;
            const isSelected = parsed !== null && parsed.year === viewYear && parsed.month === month;
            return (
              <Button
                key={label}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                onClick={() => handleSelect(month)}
              >
                {label}
              </Button>
            );
          })}
        </div>
        {value !== "" && (
          <div className="mt-3 border-t pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={handleClear}
            >
              지우기
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
