'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogClose,
} from '@atlas/ui/components/dialog';
import { Input } from '@atlas/ui/components/input';
import { navigationItems } from './navigation';
export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      className="search-trigger"
      aria-label="Search…"
      title="Search (Cmd/Ctrl + K)"
      onClick={onOpen}
    >
      <Search aria-hidden="true" />
      <span>Search…</span>
      <kbd>⌘ K</kbd>
    </button>
  );
}
export function SearchDialog({
  open,
  onOpenChange,
  onNavigate,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
  returnFocus: () => void;
}) {
  const [query, setQuery] = useState('');
  const matches = navigationItems.filter((m) =>
    m.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Find your way around Atlas</DialogTitle>
          <DialogDescription>
            Navigation only. Research content search is planned for a later
            phase.
          </DialogDescription>
        </DialogHeader>
        <label className="sr-only" htmlFor="navigation-search">
          Search navigation
        </label>
        <Input
          id="navigation-search"
          placeholder="Search pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav aria-label="Search results" className="search-results">
          {matches.map((m) => (
            <DialogClose asChild key={m.slug}>
              <Link href={m.href} onClick={() => onNavigate?.()}>
                <m.icon aria-hidden="true" />
                {m.label}
              </Link>
            </DialogClose>
          ))}
          {matches.length === 0 ? (
            <p role="status">
              No pages match “{query}”. Try another page name.
            </p>
          ) : null}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
