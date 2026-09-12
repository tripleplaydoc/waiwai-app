import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Tracker — Setup Status",
  description: "Zero-based budgeting app — deployment status page",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
