import type { Metadata, Viewport } from "next";
import "./globals.css";
import CapacitorAuthHandler from "./CapacitorAuthHandler";
import PullToRefresh from "@/components/PullToRefresh";

export const metadata: Metadata = {
  title: "StackLab",
  description: "The easiest way to run your home poker game.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">
        <CapacitorAuthHandler />
        <PullToRefresh>{children}</PullToRefresh>
      </body>
    </html>
  );
}
