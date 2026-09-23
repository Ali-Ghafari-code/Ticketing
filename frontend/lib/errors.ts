import { AxiosError } from "axios";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { field?: string; message?: string }[] | null };
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "درخواست نامعتبر است.",
  401: "لطفاً دوباره وارد شوید.",
  402: "سقف پلن اشتراک تکمیل شده است.",
  403: "شما مجوز انجام این عملیات را ندارید.",
  404: "مورد درخواستی یافت نشد.",
  409: "این مورد قبلاً ثبت شده است.",
  413: "حجم فایل بیش از حد مجاز است.",
  422: "اطلاعات وارد شده معتبر نیست.",
  429: "تعداد درخواست‌ها زیاد است. لطفاً کمی بعد تلاش کنید.",
  500: "خطای سرور. لطفاً دوباره تلاش کنید.",
  502: "سرور در دسترس نیست.",
  503: "سرویس موقتاً در دسترس نیست.",
};

async function readBody(error: AxiosError): Promise<ApiErrorBody | undefined> {
  const data = error.response?.data as unknown;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text());
    } catch {
      return undefined;
    }
  }
  return data as ApiErrorBody | undefined;
}

export function getErrorMessage(error: unknown, fallback = "خطایی رخ داد. لطفاً دوباره تلاش کنید."): string {
  if (error instanceof AxiosError) {
    if (!error.response) return "ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.";
    const body = error.response.data as ApiErrorBody | undefined;
    const details = body?.error?.details;
    if (Array.isArray(details) && details.length && details[0]?.message && error.response.status === 422) {
      return details[0].message!;
    }
    return body?.error?.message || STATUS_MESSAGES[error.response.status] || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function getErrorMessageAsync(error: unknown) {
  if (error instanceof AxiosError && error.response?.data instanceof Blob) {
    const body = await readBody(error);
    return body?.error?.message || STATUS_MESSAGES[error.response.status] || "خطایی رخ داد.";
  }
  return getErrorMessage(error);
}

export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof AxiosError) return (error.response?.data as ApiErrorBody | undefined)?.error?.code;
  return undefined;
}

/** Maps API field errors onto react-hook-form fields. Returns true if at least one was applied. */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof AxiosError)) return false;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  if (!Array.isArray(details)) return false;
  let applied = false;
  details.forEach((d) => {
    if (d.field && d.message) {
      setError(d.field.split(".").pop() as Path<T>, { type: "server", message: d.message });
      applied = true;
    }
  });
  return applied;
}
