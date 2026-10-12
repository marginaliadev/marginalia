import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pool (0xbow core)",
  description: "Deposit, withdraw and ragequit on the unmodified 0xbow Privacy Pools core.",
  // Not linked from the navigation and not indexed until the cutover (docs/bow_migration.md, step M6).
  robots: { index: false, follow: false },
};

export default function PoolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
