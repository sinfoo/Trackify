import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Manrope = UI (--font-sans), Geist Mono = IDs / amounts / kbd (--font-mono). Mapped in globals.css @theme.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "Trackify", template: "%s | Trackify" },
  description: "Trackify: six cooperating AI agents run sales, payments, security and analytics. Fictional demo data.",
  icons: { icon: "/brand/trackify-mark.png", apple: "/brand/trackify-mark.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
