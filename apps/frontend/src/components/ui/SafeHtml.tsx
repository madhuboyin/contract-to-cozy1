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
const ALLOWED_TARGETS = new Set(['_blank', '_self']);
const SAFE_URI_PATTERN =
  /^(?:(?:https?:|mailto:|tel:)|\/(?!\/)|#)/i;
const SAFE_IMAGE_SRC_PATTERN = /^https:\/\//i;

interface SafeHtmlProps {
  html: string;
  /** Wrapper element. Defaults to 'div'. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function SafeHtml({ html, as: Tag = 'div', className }: SafeHtmlProps) {
  const sanitized = useMemo(() => {
    const purified = DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ADD_ATTR: ['target'],
      FORCE_BODY: true,
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: SAFE_URI_PATTERN,
    });

    if (typeof window === 'undefined') {
      return purified;
    }

    const parser = new window.DOMParser();
    const doc = parser.parseFromString(`<div>${purified}</div>`, 'text/html');
    const container = doc.body.firstElementChild;
    if (!container) return purified;

    container.querySelectorAll('a').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      const target = anchor.getAttribute('target');
      if (!SAFE_URI_PATTERN.test(href)) {
        anchor.removeAttribute('href');
      }
      if (target && !ALLOWED_TARGETS.has(target)) {
        anchor.removeAttribute('target');
      }
      if (anchor.getAttribute('target') === '_blank') {
        anchor.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    });

    container.querySelectorAll('img').forEach((image) => {
      const src = image.getAttribute('src') || '';
      if (!SAFE_IMAGE_SRC_PATTERN.test(src)) {
        image.remove();
      }
    });

    return container.innerHTML;
  }, [html]);

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
