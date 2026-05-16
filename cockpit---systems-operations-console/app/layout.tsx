import type {Metadata} from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css'; // Global styles

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Cockpit - Systems Operations Console',
  description: 'A 3-tier master UI for observing and controlling local distributed architecture graphs.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased font-sans bg-[#e6e4dc] text-[#33312e] selection:bg-[#f59e0b]/30 selection:text-[#b45309]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
