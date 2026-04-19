const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.DOCUMENT_AI_TIMEOUT_MS = process.env.DOCUMENT_AI_TIMEOUT_MS || '50';

require('ts-node/register');

const { APIError } = require('../../src/middleware/error.middleware.ts');
const { documentIntelligenceService } = require('../../src/services/documentIntelligence.service.ts');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('document AI returns AI_TIMEOUT quickly when upstream is slow', async (t) => {
  const service = documentIntelligenceService;
  const originalGenerateContent = service.ai.models.generateContent;

  service.ai.models.generateContent = async () => {
    await sleep(250);
    return { text: '{}' };
  };

  t.after(() => {
    service.ai.models.generateContent = originalGenerateContent;
  });

  const startedAt = Date.now();

  await assert.rejects(
    () => service.analyzeDocument(Buffer.from('fake-image-bytes'), 'image/jpeg'),
    (error) => {
      assert.equal(error instanceof APIError, true);
      assert.equal(error.code, 'AI_TIMEOUT');
      assert.equal(error.statusCode, 504);
      return true;
    }
  );

  const elapsedMs = Date.now() - startedAt;
  assert.ok(
    elapsedMs < 1_000,
    `Expected timeout handling to finish quickly, received ${elapsedMs}ms`
  );
});
