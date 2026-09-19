import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import { EnvBanner } from "@/components/env-banner";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CG Ops",
  description: "Internal operations tool for CG Technologies — client mailboxes, projects, touchpoints, recruitment, and team task assignment.",
  appleWebApp: {
    title: "CG Ops",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#333333",
  // width/initialScale are Next's defaults already; spelled out so the
  // whole viewport contract is visible in one place. viewportFit "cover"
  // is the part that matters: without it iOS reports every
  // env(safe-area-inset-*) as 0, so the .safe-* helpers in globals.css
  // would silently do nothing under the translucent status bar.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${openSans.variable}`}
      data-env-banner={process.env.NEXT_PUBLIC_ENV_LABEL?.trim() ? "true" : undefined}
    >
      <body className="min-h-full flex flex-col">
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
