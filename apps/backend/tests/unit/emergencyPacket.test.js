const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Slice 7's "secure offline/emergency packet": a real downloadable PDF for
// when the app itself may be unreachable — emergency contacts and every
// Home Digital Will entry flagged isEmergency, grouped by section.
// Deliberately distinct from Property Brief's external-recipient sharing
// (a different Slice 7 mechanism) — gated at the same CONTRIBUTOR+ floor
// the Digital Will's own read route already uses.

let propertyForPacket = {
  name: 'The Smith House',
  address: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62704',
};
let willForPacket = null;

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      property: {
        findUnique: async () => propertyForPacket,
      },
      homeDigitalWill: {
        findUnique: async () => willForPacket,
      },
    },
  },
};

const { generateEmergencyPacketPdf } = require('../../src/services/emergencyPacket.service.ts');

test('throws 404 when the property does not exist, without ever touching the Digital Will table', async () => {
  propertyForPacket = null;
  await assert.rejects(
    generateEmergencyPacketPdf('property-9'),
    (error) => error.code === 'PROPERTY_NOT_FOUND',
  );
  propertyForPacket = {
    name: 'The Smith House', address: '123 Main St', city: 'Springfield', state: 'IL', zipCode: '62704',
  };
});

test('generates a real PDF even when no Digital Will exists yet for this property', async () => {
  willForPacket = null;
  const pdf = await generateEmergencyPacketPdf('property-1');
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 0);
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
});

test('generates a real PDF with emergency contacts and flagged entries when a Digital Will exists', async () => {
  willForPacket = {
    trustedContacts: [
      { name: 'Aunt Carol', isPrimary: true, relationship: 'Family', role: 'EMERGENCY_CONTACT', phone: '555-1234', email: 'carol@example.com' },
    ],
    sections: [
      {
        title: 'Utilities',
        entries: [
          { title: 'Water main shutoff', priority: 'CRITICAL', summary: 'Valve in the basement, left of the water heater.', content: null },
        ],
      },
    ],
  };
  const pdf = await generateEmergencyPacketPdf('property-1');
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  willForPacket = null;
});

test('the route gates the packet download at the same CONTRIBUTOR+ floor as reading the Digital Will itself', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const routes = fs.readFileSync(
    path.join(backendRoot, 'src/routes/homeDigitalWill.routes.ts'),
    'utf8',
  );
  const routeIndex = routes.indexOf("'/properties/:propertyId/home-digital-will/emergency-packet.pdf'");
  assert.ok(routeIndex > 0);
  const block = routes.slice(routeIndex, routes.indexOf('router.get(', routeIndex + 1));
  assert.match(block, /propertyAuthMiddleware/);
  assert.match(block, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(block, /generateEmergencyPacketPdf/);
  assert.match(block, /application\/pdf/);
});
