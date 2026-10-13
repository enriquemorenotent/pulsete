import type { ReactNode } from 'react';

export function highlightSearchText(text: string, query = ''): ReactNode {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(pattern).map((part, index) => index % 2 === 1
    ? <mark key={index} className="rounded-sm bg-amber-300/25 px-0.5 text-inherit">{part}</mark>
    : part);
}
