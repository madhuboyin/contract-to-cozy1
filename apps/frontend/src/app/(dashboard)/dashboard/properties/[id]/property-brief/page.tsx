import PropertyBriefClient from './PropertyBriefClient';

type PropertyBriefPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PropertyBriefPage({ params }: PropertyBriefPageProps) {
  const { id } = await params;
  return <PropertyBriefClient propertyId={encodeURIComponent(id)} />;
}
