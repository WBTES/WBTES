import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/firebase/auth-context";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "WBTE | Web-Based Teacher Evaluation",
  description:
    "A modern, secure web platform that helps schools automate teacher evaluations with role-based access, real-time analytics, and beautiful reports.",
  keywords: [
    "WBTE",
    "Web-Based Teacher Evaluation",
    "Teacher Evaluation Platform",
    "School Management",
    "Faculty Evaluation",
  ],
  authors: [{ name: "WBTE Project" }],
  openGraph: {
    title: "WBTE | Web-Based Teacher Evaluation",
    description:
      "Automate teacher evaluations with secure, role-based access and real-time analytics.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="wbtes-theme"
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: "hsl(var(--background))",
                  color: "hsl(var(--foreground))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.75rem",
                  fontSize: "0.875rem",
                },
                success: { iconTheme: { primary: "#10b981", secondary: "white" } },
                error: { iconTheme: { primary: "#ef4444", secondary: "white" } },
              }}
            />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
