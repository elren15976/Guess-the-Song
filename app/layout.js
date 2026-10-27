import { Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const font = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font' });

export const metadata = { title: 'Name That Tune', description: 'A group music guessing game' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
