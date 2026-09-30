// Preload for running scripts/restore-appliance-identity-tags.ts without a database: stubs Prisma's client (findMany
// returns FIXTURE_ITEMS) and the inventory service (records the calls the script makes). Everything else is real.
const Module = require('module');
const originalLoad = Module._load;
const fixtures = JSON.parse(process.env.FIXTURE_ITEMS || '[]');
Module._load = function patched(request, parent, isMain) {
  if (request === '@prisma/client') {
    return {
      PrismaClient: class {
        constructor() {
          this.inventoryItem = { findMany: async (args) => { console.log(`FINDMANY_WHERE ${JSON.stringify(args.where)}`); console.log(`FINDMANY_SELECT ${JSON.stringify(args.select)}`); return fixtures; } };
        }
        async $disconnect() { console.log('DISCONNECTED'); }
      },
    };
  }
  if (request.endsWith('/services/inventory.service')) {
    return {
      InventoryService: class {
        async restoreApplianceIdentityTags(propertyId, itemId) {
          console.log(`RESTORE_CALL ${propertyId} ${itemId}`);
          return process.env.RESTORE_RESULT ? JSON.parse(process.env.RESTORE_RESULT) : { status: 'RESTORED', type: 'X', added: [] };
        }
      },
    };
  }
  return originalLoad.apply(this, arguments);
};
