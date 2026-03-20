import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FullSpectrumDataset Portal',
  description: 'Task browser and seed-instruction submission portal for FullSpectrumDataset.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
