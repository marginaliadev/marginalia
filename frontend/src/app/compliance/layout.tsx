import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance",
  description: "Association-set screening and the appeal process for MARGINALIA deposits.",
  alternates: { canonical: "/compliance" },
  openGraph: { url: "/compliance", title: "Compliance | MARGINALIA", description: "Association-set screening and the appeal process for MARGINALIA deposits." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
