// Sole Homeowner Interface Phase 9: shared setup for the production-like database checks.
// These run the REAL services against a REAL PostgreSQL database, never mocks. They create and delete their own rows, so they must only ever
// be pointed at a throwaway database: ASK_CERT_DATABASE_URL has to name a local database whose name contains "cert". Without that variable
// every certification test is skipped, so the normal test commands never touch a database.
const url = process.env.ASK_CERT_DATABASE_URL;

function assertScratchDatabase(value) {
  const parsed = new URL(value);
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname);
  const name = parsed.pathname.replace(/^\//, '');
  if (!local || !/cert/i.test(name)) {
    throw new Error(`Refusing to run: ASK_CERT_DATABASE_URL must be a local database whose name contains "cert" (got host ${parsed.hostname}, database ${name}).`);
  }
}

const enabled = Boolean(url);
if (enabled) {
  assertScratchDatabase(url);
  process.env.DATABASE_URL = url;
}

// The document reader is constructed on import; the certification checks never call a model, so a placeholder key is enough.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'cert-placeholder-key';

require('ts-node/register/transpile-only');

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

async function seedHouseholds(prisma) {
  const make = async (label) => {
    const user = await prisma.user.create({ data: { email: `${unique(label)}@cert.test`, firstName: label, lastName: 'Cert', passwordHash: 'x' } });
    const profile = await prisma.homeownerProfile.create({ data: { userId: user.id } });
    return { user, profile };
  };
  const owner = await make('owner');
  const viewer = await make('viewer');
  const outsider = await make('outsider');
  const property = async (profile, label) => prisma.property.create({ data: { homeownerProfileId: profile.id, address: `${label} Main St`, city: 'Testville', state: 'CA', zipCode: '94000' } });
  const p1 = await property(owner.profile, '1');
  const p2 = await property(outsider.profile, '2');
  // An established owner: without a known ownership lifecycle the lifecycle gate (correctly) holds back the work and Saved readers.
  await prisma.propertyOnboarding.create({ data: { propertyId: p1.id, userId: owner.user.id, ownershipState: 'ESTABLISHED_OWNER' } });
  await prisma.propertyOnboarding.create({ data: { propertyId: p2.id, userId: outsider.user.id, ownershipState: 'ESTABLISHED_OWNER' } });
  await prisma.householdMember.create({ data: { propertyId: p1.id, userId: owner.user.id, role: 'OWNER', isPrimaryOwner: true } });
  await prisma.householdMember.create({ data: { propertyId: p1.id, userId: viewer.user.id, role: 'VIEWER' } });
  await prisma.householdMember.create({ data: { propertyId: p2.id, userId: outsider.user.id, role: 'OWNER', isPrimaryOwner: true } });
  return { owner: owner.user, viewer: viewer.user, outsider: outsider.user, p1, p2 };
}

module.exports = { enabled, unique, seedHouseholds };
