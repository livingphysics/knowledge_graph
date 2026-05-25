'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  Home,
  HelpCircle,
  Lightbulb,
  FileText,
  Clock,
  Network,
  type LucideIcon,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function TopMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="fixed top-3 right-3 z-40">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-700 [html.light_&]:bg-neutral-100/95 [html.light_&]:hover:bg-neutral-200 [html.light_&]:border-neutral-300"
      >
        <Menu className="w-5 h-5" strokeWidth={1.75} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-700 [html.light_&]:border-neutral-300 bg-neutral-900/97 [html.light_&]:bg-white/97 backdrop-blur shadow-xl overflow-hidden"
          role="menu"
        >
          <MenuLink href="/" Icon={Home} label="Home" onClick={() => setOpen(false)} />
          <MenuLink href="/list?type=question" Icon={HelpCircle} label="All questions" onClick={() => setOpen(false)} />
          <MenuLink href="/list?type=thought" Icon={Lightbulb} label="All thoughts" onClick={() => setOpen(false)} />
          <MenuLink href="/list?type=reference" Icon={FileText} label="All references" onClick={() => setOpen(false)} />
          <MenuLink href="/list" Icon={Clock} label="Recent" onClick={() => setOpen(false)} />
          <MenuLink href="/graph" Icon={Network} label="Graph view" onClick={() => setOpen(false)} />
          <div className="border-t border-neutral-800 [html.light_&]:border-neutral-200 px-3 py-2 flex justify-between items-center">
            <span className="text-xs text-neutral-500">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  Icon,
  label,
  onClick,
}: {
  href: string;
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-100"
      role="menuitem"
    >
      <Icon className="w-4 h-4 text-neutral-400 [html.light_&]:text-neutral-600" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  );
}
