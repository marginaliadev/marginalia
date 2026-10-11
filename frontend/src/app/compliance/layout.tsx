import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance",
  description: "Selective disclosure, association-set screening and the appeal process for MARGINALIA deposits.",
  alternates: { canonical: "/compliance" },
  openGraph: { url: "/compliance", title: "Compliance | MARGINALIA", description: "Selective disclosure, association-set screening and the appeal process for MARGINALIA deposits." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
