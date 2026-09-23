"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { FullScreenLoader, homeFor } from "@/components/layout/auth-guard";

export default function Home() {
  const { status, user } = useAuthStore();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && user) router.replace(homeFor(user.user_type));
  }, [status, user, router]);
  return <FullScreenLoader />;
}
