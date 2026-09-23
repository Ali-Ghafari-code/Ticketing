"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { makeQueryClient } from "@/lib/query-client";
import { refreshAccessToken } from "@/lib/api";
import { fetchMe } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth";
import { hexToRgbChannels } from "@/lib/utils";
import { ConfirmHost } from "@/components/ui/confirm-dialog";
import { ThemeProvider, useTheme } from "./theme";

/** Restores the session from the httpOnly refresh cookie on first load. */
function SessionBootstrap() {
  useEffect(() => {
    const { setStatus, clear } = useAuthStore.getState();
    refreshAccessToken().then(async (token) => {
      if (!token) return clear();
      try {
        await fetchMe();
        setStatus("authenticated");
      } catch {
        clear();
      }
    });
  }, []);
  return null;
}

/** Applies the tenant's brand colour as the primary colour. */
function BrandColor() {
  const color = useAuthStore((s) => s.user?.company?.primary_color);
  useEffect(() => {
    const channels = color ? hexToRgbChannels(color) : null;
    if (channels) document.documentElement.style.setProperty("--primary", channels);
    else document.documentElement.style.removeProperty("--primary");
  }, [color]);
  return null;
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      position="top-center"
      dir="rtl"
      richColors
      closeButton
      theme={resolved}
      toastOptions={{ style: { fontFamily: "Vazirmatn, Tahoma, sans-serif" } }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SessionBootstrap />
        <BrandColor />
        {children}
        <ConfirmHost />
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
