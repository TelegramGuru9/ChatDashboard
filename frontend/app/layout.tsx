import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Telegram CRM',
  description: 'AI-powered Telegram CRM platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body style={{ background: '#0d1117', color: '#e2e8f0', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
