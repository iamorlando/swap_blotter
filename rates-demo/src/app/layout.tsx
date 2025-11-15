import "./globals.css";
import type { Metadata } from "next";
import ClientProviders from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "Rates Demo",
  description: "Demo app with Prisma, Pyodide, MUI DataGrid",
};

export default function RootLayout({ children, modal }: any) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <ClientProviders>
          {children}
          {modal}
        </ClientProviders>
      </body>
    </html>
  );
}
