import Link from 'next/link';
import { ScrollFadeX } from '@/components/ui/ScrollFadeX';

type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <ScrollFadeX>
    <nav aria-label="Breadcrumb" className="overflow-x-auto text-sm text-muted-foreground">
      <ol className="flex min-w-max items-center space-x-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-center space-x-2">
            {idx > 0 && <span className="text-slate-500">/</span>}
            {item.href ? (
              <Link
                href={item.href}
                className="no-brand-style whitespace-nowrap text-slate-700 hover:text-gray-900 active:opacity-70 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="whitespace-nowrap text-gray-900 font-medium">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
    </ScrollFadeX>
  );
}
