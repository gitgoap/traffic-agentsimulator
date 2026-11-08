import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Traffic Lab — A small world of moving decisions',
  description:
    'An interactive, from-scratch agent-based traffic laboratory. Explore roads, junctions, signals, and flyovers, then compare the outcomes.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
