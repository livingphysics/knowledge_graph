'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem('kg-theme', next ? 'light' : 'dark');
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      className="text-sm px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 [html.light_&]:border-neutral-300 [html.light_&]:hover:bg-neutral-200 flex items-center gap-1.5"
      aria-label="Toggle theme"
    >
      {light ? <Sun className="w-4 h-4" strokeWidth={1.75} /> : <Moon className="w-4 h-4" strokeWidth={1.75} />}
      <span>{light ? 'Light' : 'Dark'}</span>
    </button>
  );
}
