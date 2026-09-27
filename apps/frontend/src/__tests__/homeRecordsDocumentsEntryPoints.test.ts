import fs from 'fs';
import path from 'path';
import { homeRecordsHref } from '@/lib/routes/homeRecordsHref';

// Home Records replaces the legacy Documents workspace as the place for a home's documents. Every link that used to open the legacy page is
// built for Home Records, the legacy page route only redirects, and the legacy page client is gone.
const srcRoot = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

describe('homeRecordsHref', () => {
  it('builds the Home Records page, with an optional upload or record deep link', () => {
    expect(homeRecordsHref('p1')).toBe('/dashboard/properties/p1/tools/home-records');
    expect(homeRecordsHref('p1', { upload: true })).toBe('/dashboard/properties/p1/tools/home-records?action=upload');
    expect(homeRecordsHref('p 1', { recordId: 'r1' })).toBe('/dashboard/properties/p%201/tools/home-records?recordId=r1');
  });
});

describe('legacy Documents entry points', () => {
  it('no source builds a property-scoped link to the legacy Documents page', () => {
    const offenders = walk(srcRoot).filter((file) => /dashboard\/documents\?propertyId/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders.map((file) => path.relative(srcRoot, file))).toEqual([]);
  });

  it('the legacy page client is removed and the property Documents route only redirects to Home Records', () => {
    expect(fs.existsSync(path.join(srcRoot, 'app/(dashboard)/dashboard/documents/DocumentsPageClient.tsx'))).toBe(false);
    const page = fs.readFileSync(path.join(srcRoot, 'app/(dashboard)/dashboard/properties/[id]/documents/page.tsx'), 'utf8');
    expect(page).toMatch(/redirect\(`\/dashboard\/properties\/\$\{encodeURIComponent\(id\)\}\/tools\/home-records/);
    expect(page).not.toMatch(/DocumentsPageClient/);
  });

  it('the documents route map resolves to Home Records, and Home Records opens its upload for ?action=upload', () => {
    const map = fs.readFileSync(path.join(srcRoot, 'lib/routes/dashboardPropertyAwareHref.ts'), 'utf8');
    expect(map).toMatch(/navTarget: 'documents'[\s\S]*tools\/home-records/);
    const client = fs.readFileSync(path.join(srcRoot, 'app/(dashboard)/dashboard/properties/[id]/tools/home-records/HomeRecordsClient.tsx'), 'utf8');
    expect(client).toMatch(/useState\(\(\) => searchParams\.get\('action'\) === 'upload'\)/);
  });
});
