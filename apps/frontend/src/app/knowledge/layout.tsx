import { PropertyProvider } from '@/lib/property/PropertyContext';

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <PropertyProvider>{children}</PropertyProvider>;
}
