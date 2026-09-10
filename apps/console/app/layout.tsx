import type { Metadata } from 'next';
import { Geist, Geist_Mono, Pixelify_Sans } from 'next/font/google';
import './globals.css';
import Nav from './Nav';
import VideoBackground from './VideoBackground';

// Geist carries the whole interface; Pixelify is used sparingly as a
// display face (the wordmark, eyebrows, and the big stat numbers) — a
// pixel font is unreadable at body size, so it never touches body copy.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const pixelify = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixelify', display: 'swap' });

export const metadata: Metadata = {
  title: 'Tally — revenue becomes a bond',
  description: "A shop's verified revenue becomes a short bond. Underwritten in private, priced in public, settles itself.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${pixelify.variable}`}>
      <body>
        <VideoBackground />
        <Nav />
        {children}
        <footer className="site-footer">
          <p>Tally — built for ETHOnline 2026 · Hedera · Chainlink · The Graph</p>
          <p>Every figure on this site is a real query against real testnet infrastructure.</p>
        </footer>
      </body>
    </html>
  );
}
