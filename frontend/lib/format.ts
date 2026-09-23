import * as jalaali from "jalaali-js";

const faDigits = "۰۱۲۳۴۵۶۷۸۹";

export function toFaDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\d/g, (d) => faDigits[Number(d)]);
}

export function toEnDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const numberFmt = new Intl.NumberFormat("fa-IR");
export function formatNumber(value: number | null | undefined, fallback = "—") {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return numberFmt.format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${formatNumber(Math.round(value * 10) / 10)}٪`;
}

const dateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const dayMonthFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric" });

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

export function formatDate(value?: string | Date | null) {
  return value ? dateFmt.format(toDate(value)) : "—";
}
export function formatShortDate(value?: string | Date | null) {
  return value ? shortDateFmt.format(toDate(value)) : "—";
}
export function formatDateTime(value?: string | Date | null) {
  return value ? dateTimeFmt.format(toDate(value)) : "—";
}
export function formatTime(value?: string | Date | null) {
  return value ? timeFmt.format(toDate(value)) : "";
}
export function formatDayMonth(value?: string | Date | null) {
  return value ? dayMonthFmt.format(toDate(value)) : "";
}

/** "2026-09-23" (a calendar date, not an instant) -> Persian short label */
export function formatIsoDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const j = jalaali.toJalaali(y, m, d);
  return toFaDigits(`${j.jm}/${j.jd}`);
}

const rtf = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });
export function timeAgo(value?: string | Date | null) {
  if (!value) return "—";
  const diff = (toDate(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "همین الان";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(value);
}

/** minutes -> "۲ ساعت و ۱۵ دقیقه" */
export function formatDuration(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${toFaDigits(m)} دقیقه`;
  const hours = Math.floor(m / 60);
  const rem = m % 60;
  if (hours < 24) return rem ? `${toFaDigits(hours)} ساعت و ${toFaDigits(rem)} دقیقه` : `${toFaDigits(hours)} ساعت`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${toFaDigits(days)} روز و ${toFaDigits(h)} ساعت` : `${toFaDigits(days)} روز`;
}

export function formatCountdown(seconds: number) {
  const s = Math.abs(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  let text: string;
  if (d > 0) text = `${toFaDigits(d)} روز ${toFaDigits(h)} ساعت`;
  else if (h > 0) text = `${toFaDigits(h)} ساعت ${toFaDigits(m)} دقیقه`;
  else text = `${toFaDigits(Math.max(m, 0))} دقیقه`;
  return seconds < 0 ? `${text} تاخیر` : `${text} مانده`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${toFaDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toFaDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toFaDigits((bytes / 1024 / 1024).toFixed(1))} مگابایت`;
}

export function formatPrice(rials: number) {
  if (!rials) return "رایگان";
  return `${formatNumber(rials)} تومان`;
}

export { jalaali };
