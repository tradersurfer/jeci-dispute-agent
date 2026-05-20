import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Credora AI — AI-Powered Credit Intelligence',
  description:
    'Your credit report has errors. Credora AI finds them and fights back — automatically. Bureau-specific dispute letters in minutes.',
  openGraph: {
    title: 'Credora AI — AI-Powered Credit Intelligence',
    description: 'Upload your credit report. Get dispute-ready letters for all 3 bureaus.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="bg-credora-bg text-credora-text font-body antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
