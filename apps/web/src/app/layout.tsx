// apps/web/src/app/layout.tsx

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Header from "@/components/layout/Header";
import Dock from "../components/layout/Dock";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ✅ script de thème (comme avant)
const themeScript = `(function(){var key='infinity.theme';var fallbacks=['dark','light','neon'];try{var root=document.documentElement;var stored=localStorage.getItem(key);var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=fallbacks.indexOf(stored)>=0?stored:(prefersDark?'dark':'light');root.classList.remove('dark','light','neon');root.classList.add(theme);root.style.colorScheme=theme==='light'?'light':'dark';if(stored!==theme){localStorage.setItem(key,theme);}}catch(_){}})();`;

export const metadata: Metadata = {
  title: "Infinity",
  description: "Donne vie à tes idées.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        <Header />

        <main className="pt-24 pb-24">{children}</main>

        {/* 🔻 Dock flottant en bas */}
        <Dock />
      </body>
    </html>
  );
}