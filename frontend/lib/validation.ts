import { z } from "zod";
import { toEnDigits } from "@/lib/format";

export const mobileRegex = /^09\d{9}$/;

export function normalizeMobile(value: string) {
  let v = toEnDigits(value).replace(/[\s\-()]/g, "");
  if (v.startsWith("+98")) v = "0" + v.slice(3);
  else if (v.startsWith("0098")) v = "0" + v.slice(4);
  else if (v.startsWith("98") && v.length === 12) v = "0" + v.slice(2);
  else if (v.startsWith("9") && v.length === 10) v = "0" + v;
  return v;
}

export const zMobile = z
  .string()
  .trim()
  .transform((v) => (v ? normalizeMobile(v) : ""))
  .refine((v) => !v || mobileRegex.test(v), "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)");

export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => !v || z.string().email().safeParse(v).success, "ایمیل معتبر نیست");

export const zPassword = z
  .string()
  .min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد")
  .max(128, "رمز عبور بیش از حد طولانی است")
  .refine((v) => /\d/.test(v) && /\p{L}/u.test(v), "رمز عبور باید شامل حروف و اعداد باشد");

export const zRequired = (label: string, min = 2) =>
  z.string().trim().min(1, `${label} الزامی است`).min(min, `${label} باید حداقل ${min} کاراکتر باشد`);

export const zHexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "کد رنگ معتبر نیست");
