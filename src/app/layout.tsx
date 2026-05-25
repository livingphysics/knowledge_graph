import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Knowledge Graph',
  description: 'A collaborative knowledge graph of questions, thoughts, and references.',
};

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
