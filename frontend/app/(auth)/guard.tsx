"use client";
import { GuestGuard } from "@/components/layout/auth-guard";

export function AuthLayoutGuard({ children }: { children: React.ReactNode }) {
  return <GuestGuard>{children}</GuestGuard>;
}
