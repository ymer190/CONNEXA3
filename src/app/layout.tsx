import type { Metadata, Viewport } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
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
  themeColor: "#F8F5EB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { if (localStorage.getItem("connexa-theme") === "sunset") { document.documentElement.dataset.theme = "sunset"; document.documentElement.style.colorScheme = "dark"; } } catch (_) {}`,
          }}
        />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
