import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shielded App",
  description: "Deposit, withdraw privately with an in-browser zero-knowledge proof, use the gasless Courier, or ragequit.",
  alternates: { canonical: "/app" },
  openGraph: { url: "/app", title: "Shielded App | MARGINALIA", description: "Deposit, withdraw privately with an in-browser zero-knowledge proof, use the gasless Courier, or ragequit." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
