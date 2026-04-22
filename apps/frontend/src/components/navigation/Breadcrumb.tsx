import Link from 'next/link';

type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="overflow-x-auto text-sm text-muted-foreground">
      <ol className="flex min-w-max items-center space-x-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-center space-x-2">
            {idx > 0 && <span className="text-slate-400">/</span>}
            {item.href ? (
              <Link
                href={item.href}
                className="whitespace-nowrap hover:text-gray-900 transition-colors"
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
  );
}
