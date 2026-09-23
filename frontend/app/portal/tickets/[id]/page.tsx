"use client";
import { use } from "react";
import { TicketDetailView } from "@/components/tickets/ticket-detail";

export default function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TicketDetailView id={id} mode="portal" />;
}
