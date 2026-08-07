import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./community.css";
import "./commercial-ui.css";
import "./buddy-editorial.css";

const neoXiHei = localFont({
  src: "../public/fonts/LXGWNeoXiHei-v1.304.woff",
  variable: "--font-body-local",
  display: "swap",
  preload: true,
  weight: "400",
  fallback: ["PingFang SC", "Microsoft YaHei", "system-ui", "sans-serif"]
});

const wenKai = localFont({
  src: "../public/fonts/LXGWWenKaiGBLite-Regular-v1.522.woff2",
  variable: "--font-display-local",
  display: "swap",
  preload: false,
  weight: "400",
  fallback: ["LXGW Neo XiHei", "PingFang SC", "Microsoft YaHei", "serif"]
});

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
    <html className={`${neoXiHei.variable} ${wenKai.variable}`} lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
