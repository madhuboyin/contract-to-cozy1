// apps/frontend/src/components/ui/SafeHtml.tsx
//
// Drop-in replacement for dangerouslySetInnerHTML that runs DOMPurify
// before injecting HTML into the DOM. Use this whenever you need to render
// HTML from an untrusted or semi-trusted source (e.g. rich-text fields,
// AI-generated descriptions, RSS content).
//
// Usage:
//   <SafeHtml html={untrustedString} />
//   <SafeHtml html={untrustedString} as="span" className="prose" />
//
// DOMPurify strips all script tags, event handlers (onclick, onerror, …),
// javascript: URIs, and other XSS vectors. The sanitized HTML is injected
// via dangerouslySetInnerHTML so React does not double-escape the markup.

'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Safe allowed tags / attributes — no script, no event handlers, no javascript: URIs.
const ALLOWED_TAGS = [
  'b', 'i', 'em', 'strong', 'u', 's', 'br',
  'p', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'span', 'div',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
];
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height'];

interface SafeHtmlProps {
  html: string;
  /** Wrapper element. Defaults to 'div'. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function SafeHtml({ html, as: Tag = 'div', className }: SafeHtmlProps) {
  const sanitized = useMemo(
    () => DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ADD_ATTR: ['target'], FORCE_BODY: true }),
    [html]
  );

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
