import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CG Client Tracker",
  description: "Internal operations tracker for CG Technologies — client mailboxes, projects, touchpoints, and team task assignment.",
  appleWebApp: {
    title: "CG Tracker",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#333333",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${openSans.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
