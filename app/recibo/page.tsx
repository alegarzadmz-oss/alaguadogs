import type { Metadata } from "next";
import { OwnerReceipt } from "@/components/owner-receipt";
export const metadata: Metadata = {
  title: "Tu mascota · AL’AGUA DOGS",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export default function ReceiptPage() {
  return <OwnerReceipt />;
}
