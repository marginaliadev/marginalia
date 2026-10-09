import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explorer",
  description: "Check the Wax Seal (nullifier) status of any note on the MARGINALIA pool, live from the chain.",
  alternates: { canonical: "/explorer" },
  openGraph: { url: "/explorer", title: "Explorer | MARGINALIA", description: "Check the Wax Seal (nullifier) status of any note on the MARGINALIA pool, live from the chain." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
