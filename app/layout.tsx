import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Booking Management",
    template: "%s · Booking Management",
  },
  description:
    "Multi-tenant appointment booking and scheduling for clinics, salons, spas and consultants.",
};

export const viewport: Viewport = {
  // The colour behind the browser chrome on a phone, so the address bar
  // belongs to the page rather than floating above it in white.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121318" },
  ],
};

/**
 * Chooses the theme before the first paint.
 *
 * It has to be an inline, blocking script: React has not run yet, and setting
 * the class any later means a white page flashes before a dark one. Wrapped
 * in try/catch because `localStorage` throws outright in some privacy modes,
 * and a theme preference is not worth a blank page.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables go on <html>, not <body>. `font-sans` resolves to
    // var(--font-geist-sans), and the stylesheet applies it to <html> — so
    // with the variable defined one level further down it resolved to
    // nothing and the entire product rendered in the browser's default
    // serif. On <html> the variable is in scope where it is used.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
