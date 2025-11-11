import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rates Demo",
  description: "Demo app with Prisma, Pyodide, MUI DataGrid",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}

