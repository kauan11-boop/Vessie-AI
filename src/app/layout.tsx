import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vessie AI Chat",
  description: "Chatbot local, privado, multi-provider — LM Studio, Ollama, OpenRouter. Nada sai do seu PC.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect x='20' y='20' width='80' height='80' rx='30' fill='%23C15F3C'/%3E%3Ccircle cx='47' cy='60' r='7' fill='%23FFF7EA'/%3E%3Ccircle cx='73' cy='60' r='7' fill='%23FFF7EA'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: "#16120E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${jbMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
