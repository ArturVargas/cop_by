import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { AppCavosProvider } from "@/components/cavos-provider";
import { Navbar } from "@/components/navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "COP By — USDC a pesos",
  description:
    "Wallet Stellar con USDC. Envia o gasta a Bre-B, Pix y SPEI via TuCOP.",
  other: {
    "talentapp:project_verification":
      "8abf4ec6d9e7825d922515f134d0ba0299c4deefc75a1b67a4c3b1712dd2e1f04e453f42e36f29110cd4efeb45dd43b6a878892c6f08b4248cab4659c124eb6a",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="relative flex min-h-screen flex-col bg-[#F7F8F5]">
          <AppCavosProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
          </AppCavosProvider>
        </div>
      </body>
    </html>
  );
}
