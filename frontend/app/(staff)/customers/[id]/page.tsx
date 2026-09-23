"use client";
import { use } from "react";
import { UserDetailView } from "@/components/users/user-detail";

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserDetailView id={id} kind="customers" />;
}
