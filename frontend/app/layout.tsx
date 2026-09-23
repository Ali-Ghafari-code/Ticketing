import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/common/providers";
import { themeScript } from "@/components/common/theme";

export const metadata: Metadata = {
  title: { default: "سامانه پشتیبانی", template: "%s | سامانه پشتیبانی" },
  description: "سامانه جامع پشتیبانی مشتریان و مدیریت تیکت",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
