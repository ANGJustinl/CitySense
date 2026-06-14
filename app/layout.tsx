import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CitySense",
  description: "City signal driven route recommendations"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
