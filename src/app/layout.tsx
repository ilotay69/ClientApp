import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CG Client Tracker",
  description: "Internal operations tracker for CG Technologies — client mailboxes, projects, touchpoints, and team task assignment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
