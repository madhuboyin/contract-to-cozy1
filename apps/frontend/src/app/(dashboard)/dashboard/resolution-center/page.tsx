import JobHubRedirectPage from '@/components/navigation/JobHubRedirectPage';

/**
 * Resolution Center Redirect Page
 * 
 * DEPRECATED: This route now redirects to the property-specific fix page.
 * The canonical route is /dashboard/properties/[id]/fix
 * 
 * This maintains backward compatibility for:
 * - Old bookmarks
 * - External links
 * - Legacy navigation
 */
export default function ResolutionCenterRedirectPage() {
  return <JobHubRedirectPage jobKey="fix" />;
}
