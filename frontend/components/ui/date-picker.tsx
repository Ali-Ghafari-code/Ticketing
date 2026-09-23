"use client";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { jalaali, toFaDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover } from "./popover";
import { inputBase } from "./input";

const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEK = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** ISO "YYYY-MM-DD" (Gregorian) <-> Jalali display. */
function isoToJalali(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return jalaali.toJalaali(y, m, d);
}

function jalaliToIso(jy: number, jm: number, jd: number) {
  const g = jalaali.toGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

interface DatePickerProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  min?: string;
  max?: string;
  invalid?: boolean;
}

export function DatePicker({ value, onChange, placeholder = "انتخاب تاریخ", className, clearable = true, min, max, invalid }: DatePickerProps) {
  const today = new Date();
  const todayJ = jalaali.toJalaali(today);
  const selected = value ? isoToJalali(value) : null;
  const [view, setView] = useState(() => ({ jy: selected?.jy ?? todayJ.jy, jm: selected?.jm ?? todayJ.jm }));

  const cells = useMemo(() => {
    const first = jalaali.toGregorian(view.jy, view.jm, 1);
    const weekday = (new Date(first.gy, first.gm - 1, first.gd).getDay() + 1) % 7; // Saturday = 0
    const length = jalaali.jalaaliMonthLength(view.jy, view.jm);
    return [...Array(weekday).fill(null), ...Array.from({ length }, (_, i) => i + 1)] as (number | null)[];
  }, [view]);

  const move = (delta: number) =>
    setView((v) => {
      let jm = v.jm + delta;
      let jy = v.jy;
      if (jm < 1) {
        jm = 12;
        jy -= 1;
      } else if (jm > 12) {
        jm = 1;
        jy += 1;
      }
      return { jy, jm };
    });

  const label = selected ? toFaDigits(`${selected.jy}/${pad(selected.jm)}/${pad(selected.jd)}`) : "";

  return (
    <Popover
      className={cn("w-full", className)}
      panelClassName="w-72 p-3"
      trigger={({ toggle }) => (
        <div className="relative">
          <button
            type="button"
            onClick={toggle}
            aria-invalid={invalid || undefined}
            className={cn(inputBase, "flex h-10 items-center gap-2 text-start", !label && "text-muted-foreground/70")}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{label || placeholder}</span>
          </button>
          {clearable && value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="پاک کردن تاریخ"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    >
      {(close) => (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => move(-1)} className="rounded-md p-1.5 hover:bg-muted" aria-label="ماه قبل">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">
              {MONTHS[view.jm - 1]} {toFaDigits(view.jy)}
            </span>
            <button type="button" onClick={() => move(1)} className="rounded-md p-1.5 hover:bg-muted" aria-label="ماه بعد">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEK.map((w) => (
              <span key={w} className="py-1 text-muted-foreground">{w}</span>
            ))}
            {cells.map((day, i) => {
              if (!day) return <span key={`b${i}`} />;
              const iso = jalaliToIso(view.jy, view.jm, day);
              const isSelected = value === iso;
              const isToday = todayJ.jy === view.jy && todayJ.jm === view.jm && todayJ.jd === day;
              const disabled = (min && iso < min) || (max && iso > max);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!!disabled}
                  onClick={() => {
                    onChange(iso);
                    close();
                  }}
                  className={cn(
                    "h-8 rounded-md transition-colors disabled:opacity-30",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    isToday && !isSelected && "font-bold text-primary ring-1 ring-primary/30",
                  )}
                >
                  {toFaDigits(day)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t pt-2">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                onChange(jalaliToIso(todayJ.jy, todayJ.jm, todayJ.jd));
                close();
              }}
            >
              امروز
            </button>
            {clearable && (
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { onChange(null); close(); }}>
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
