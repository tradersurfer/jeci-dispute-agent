import type { Metadata } from 'next';
import { Playfair_Display, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JECI Credit — AI-Powered Credit Intelligence',
  description:
    'JECI AI scans your credit report for FCRA violations, generates bureau-specific dispute letters, and delivers a ready-to-mail package. Find it. Fight it. Fix it.',
  openGraph: {
    title: 'JECI Credit — AI-Powered Credit Intelligence',
    description: 'Find it. Fight it. Fix it. — AI dispute letters for all 3 bureaus.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-jeci-bg text-jeci-text font-body antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
