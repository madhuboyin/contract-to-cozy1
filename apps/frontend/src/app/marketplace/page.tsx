import { redirect } from 'next/navigation';

type MarketplacePageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
      return;
    }

    if (typeof value === 'string') {
      params.set(key, value);
    }
  });

  const query = params.toString();
  redirect(query ? `/dashboard/providers?${query}` : '/dashboard/providers');
}
