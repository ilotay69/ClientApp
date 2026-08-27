import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CG Client Tracker",
  description: "Internal quote, project, and client relationship tracker for CG Technologies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
