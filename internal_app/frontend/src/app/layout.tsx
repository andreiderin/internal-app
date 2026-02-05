import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Navi Internal Planner",
  description: "Internal tools for planner input and schedule visualization",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-white text-[#1f2337]">{children}</body>
    </html>
  );
}
