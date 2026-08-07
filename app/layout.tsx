import type { Metadata } from "next";
import "./globals.css";
import "./community.css";
import "./commercial-ui.css";
import "./buddy-editorial.css";

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
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/LXGWNeoXiHei-v1.304.woff" as="font" type="font/woff" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lxgw-wenkai-gb-web@1.522.0/lxgwwenkaigb-regular/result.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
