import './globals.css';
import type { Metadata } from 'next';
import { siteTitle, siteDescription } from '@/lib/site';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: siteTitle(),
    description: siteDescription(),
  };
}

// Run before hydration so dark mode never flashes.
const themeBootstrap = `
(function () {
  try {
    var saved = localStorage.getItem('kg-theme');
    if (saved === 'light') document.documentElement.classList.add('light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
