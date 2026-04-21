const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let capturedEventInput = null;
let capturedCompletionInput = null;

const orchestrationServicePath = require.resolve('../../src/services/orchestration.service.ts');
require.cache[orchestrationServicePath] = {
  id: orchestrationServicePath,
  filename: orchestrationServicePath,
  loaded: true,
  exports: {
    getOrchestrationDecisionDiagnostics: async () => ({}),
    getOrchestrationSummary: async () => ({}),
  },
};

const eventServicePath = require.resolve('../../src/services/orchestrationEvent.service.ts');
require.cache[eventServicePath] = {
  id: eventServicePath,
  filename: eventServicePath,
  loaded: true,
  exports: {
    recordOrchestrationEvent: async (input) => {
      capturedEventInput = input;
      return { id: 'evt-1' };
    },
  },
};

const snoozeServicePath = require.resolve('../../src/services/orchestrationSnooze.service.ts');
require.cache[snoozeServicePath] = {
  id: snoozeServicePath,
  filename: snoozeServicePath,
  loaded: true,
  exports: {
    snoozeAction: async () => {},
    unsnoozeAction: async () => {},
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      propertyMaintenanceTask: {
        findFirst: async () => null,
      },
      orchestrationDecisionTrace: {
        findUnique: async () => null,
      },
      orchestrationActionEvent: {
        deleteMany: async () => ({ count: 0 }),
      },
    },
  },
};

const completionServicePath = require.resolve('../../src/services/orchestrationCompletion.service.ts');
require.cache[completionServicePath] = {
  id: completionServicePath,
  filename: completionServicePath,
  loaded: true,
  exports: {
    createCompletion: async (input) => {
      capturedCompletionInput = input;
      return { id: 'comp-1' };
    },
  },
};

const maintenanceServicePath = require.resolve('../../src/services/PropertyMaintenanceTask.service.ts');
require.cache[maintenanceServicePath] = {
  id: maintenanceServicePath,
  filename: maintenanceServicePath,
  loaded: true,
  exports: {
    PropertyMaintenanceTaskService: {
      updateTaskStatus: async () => {},
    },
  },
};

const validatorPath = require.resolve('../../src/validators/orchestrationCompletion.validator.ts');
require.cache[validatorPath] = {
  id: validatorPath,
  filename: validatorPath,
  loaded: true,
  exports: {
    completionCreateSchema: {
      safeParse: () => ({ success: true }),
    },
  },
};

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  },
};

const {
  markOrchestrationActionCompleted,
} = require('../../src/controllers/orchestration.controller.ts');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('markOrchestrationActionCompleted uses route param propertyId over request body', async () => {
  capturedEventInput = null;
  capturedCompletionInput = null;

  const req = {
    params: { propertyId: 'route-property-id' },
    body: {
      propertyId: 'forged-body-property-id',
      actionKey: 'action-1',
      completionData: { notes: 'done' },
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await markOrchestrationActionCompleted(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedEventInput.propertyId, 'route-property-id');
  assert.equal(capturedCompletionInput.propertyId, 'route-property-id');
});
