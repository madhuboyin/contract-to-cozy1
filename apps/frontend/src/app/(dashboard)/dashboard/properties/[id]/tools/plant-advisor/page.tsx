import PropertyScopedToolRedirectPage from '@/components/navigation/PropertyScopedToolRedirectPage';

// Plant Advisor is paused (Kill/Pause bucket). Redirect to inventory so users
// land somewhere useful rather than a dead-end tool page.
export default function PlantAdvisorPage() {
  return (
    <PropertyScopedToolRedirectPage
      toolKey="inventory"
      navTarget="inventory"
    />
  );
}
