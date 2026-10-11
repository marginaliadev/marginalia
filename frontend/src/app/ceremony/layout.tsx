import type { Metadata } from "next";

const description =
  "Live status of the MARGINALIA Phase-2 trusted-setup ceremony: contributors, round hashes, public attestations, the drand beacon and the Phase-1 pin.";

export const metadata: Metadata = {
  title: "Trusted Setup Ceremony",
  description,
  alternates: { canonical: "/ceremony" },
  openGraph: { url: "/ceremony", title: "Trusted Setup Ceremony | MARGINALIA", description },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
