import PropertyScopedToolRedirectPage from '@/components/navigation/PropertyScopedToolRedirectPage';

// Duplicate route — canonical destination is /properties/:id/tools/home-event-radar.
export default function RiskRadarLegacyPage() {
  return (
    <PropertyScopedToolRedirectPage
      toolKey="home-event-radar"
      navTarget="tool:home-event-radar"
    />
  );
}
