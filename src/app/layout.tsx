import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Connexa — comunicação que aproxima",
    template: "%s | Connexa",
  },
  description:
    "Um espaço de trabalho para conectar pessoas, conversas e equipes.",
  applicationName: "Connexa",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10131b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
