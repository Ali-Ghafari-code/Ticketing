import { KbBrowser } from "@/components/kb/kb-browser";

export const metadata = { title: "پایگاه دانش" };

export default function PortalKbPage() {
  return <KbBrowser basePath="/portal/kb" />;
}
