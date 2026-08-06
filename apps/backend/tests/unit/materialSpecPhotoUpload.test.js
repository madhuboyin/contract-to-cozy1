const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Item 7+8 of this session's Slice 5 list, built together since they're
// coupled: a real multipart photo-capture upload (materialSpec.service.ts's
// uploadPhoto) that best-effort fires AI extraction against the uploaded
// buffer (runPhotoExtraction), reconciling the previously-dead
// MaterialExtractionReview model with a real AI source instead of leaving
// candidateFields as an arbitrary caller-supplied payload.

let specForBelongs = { id: 'spec-1', propertyId: 'property-1' };
let existingPhotoCount = 0;
const photoCreateCalls = [];
const extractionReviewCreateCalls = [];
let analyzeMaterialPhotoResult = { candidateFields: {}, confidence: 0 };
let analyzeMaterialPhotoError = null;
const analyzeMaterialPhotoCalls = [];
let uploadDocumentBufferResult = { key: 'materials/user-1/property-1/123-photo.jpg' };
let presignResult = 'https://signed.example.com/materials/photo.jpg';

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      materialSpec: {
        findFirst: async () => specForBelongs,
      },
      materialSpecPhoto: {
        count: async () => existingPhotoCount,
        create: async (args) => { photoCreateCalls.push(args); return { id: 'photo-1', ...args.data }; },
      },
      materialExtractionReview: {
        create: async (args) => { extractionReviewCreateCalls.push(args); return { id: 'review-1', ...args.data }; },
      },
    },
  },
};

const storagePath = require.resolve('../../src/services/storage/reportStorage.ts');
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    uploadDocumentBuffer: async () => uploadDocumentBufferResult,
  },
};

const presignPath = require.resolve('../../src/services/storage/presign.ts');
require.cache[presignPath] = {
  id: presignPath,
  filename: presignPath,
  loaded: true,
  exports: {
    presignGetObject: async () => presignResult,
  },
};

const intelligencePath = require.resolve('../../src/services/documentIntelligence.service.ts');
require.cache[intelligencePath] = {
  id: intelligencePath,
  filename: intelligencePath,
  loaded: true,
  exports: {
    documentIntelligenceService: {
      analyzeMaterialPhoto: async (buffer, mimeType) => {
        analyzeMaterialPhotoCalls.push({ buffer, mimeType });
        if (analyzeMaterialPhotoError) throw analyzeMaterialPhotoError;
        return analyzeMaterialPhotoResult;
      },
    },
  },
};

const originalBucket = process.env.S3_BUCKET;
process.env.S3_BUCKET = 'bucket-1';
test.after(() => { process.env.S3_BUCKET = originalBucket; });

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const service = new MaterialSpecService();

const file = { buffer: Buffer.from('fake-jpeg'), originalname: 'tile-box.jpg', mimetype: 'image/jpeg' };

test('uploadPhoto refuses a 11th photo', async () => {
  existingPhotoCount = 10;

  await assert.rejects(
    service.uploadPhoto('property-1', 'spec-1', 'user-1', file),
    (error) => error.code === 'PHOTO_LIMIT_EXCEEDED',
  );
});

test('uploadPhoto stores the file, creates a MaterialSpecPhoto with a real signed URL, and fires extraction', async () => {
  existingPhotoCount = 2;
  photoCreateCalls.length = 0;
  analyzeMaterialPhotoCalls.length = 0;
  extractionReviewCreateCalls.length = 0;
  analyzeMaterialPhotoResult = { candidateFields: {}, confidence: 0 };

  const photo = await service.uploadPhoto('property-1', 'spec-1', 'user-1', file, { caption: 'Box front' });

  assert.equal(photoCreateCalls.length, 1);
  const data = photoCreateCalls[0].data;
  assert.equal(data.materialSpecId, 'spec-1');
  assert.equal(data.propertyId, 'property-1');
  assert.equal(data.fileKey, uploadDocumentBufferResult.key);
  assert.equal(data.photoUrl, presignResult);
  assert.equal(data.caption, 'Box front');
  assert.equal(data.sortOrder, 2);
  assert.equal(photo.id, 'photo-1');

  await flushMicrotasks();
  assert.equal(analyzeMaterialPhotoCalls.length, 1);
  assert.equal(analyzeMaterialPhotoCalls[0].mimeType, 'image/jpeg');
});

test('uploadPhoto refuses when the spec does not belong to this property', async () => {
  specForBelongs = null;

  await assert.rejects(
    service.uploadPhoto('property-1', 'spec-9', 'user-1', file),
  );

  specForBelongs = { id: 'spec-1', propertyId: 'property-1' };
});

test('runPhotoExtraction creates a NEEDS_REVIEW row with real, non-fabricated candidate fields when the AI finds something', async () => {
  existingPhotoCount = 0;
  analyzeMaterialPhotoResult = {
    candidateFields: { manufacturer: 'Sherwin-Williams', colorCode: 'SW 7008' },
    confidence: 0.72,
  };
  extractionReviewCreateCalls.length = 0;

  await service.uploadPhoto('property-1', 'spec-1', 'user-1', file);
  await flushMicrotasks();

  assert.equal(extractionReviewCreateCalls.length, 1);
  const data = extractionReviewCreateCalls[0].data;
  assert.equal(data.materialSpecId, 'spec-1');
  assert.equal(data.propertyId, 'property-1');
  assert.equal(data.sourcePhotoKey, uploadDocumentBufferResult.key);
  assert.equal(data.extractionMethod, 'DOCUMENT_AI');
  assert.deepEqual(data.candidateFields, { manufacturer: 'Sherwin-Williams', colorCode: 'SW 7008' });
  // One overall confidence shared across every extracted field — same
  // documented limitation as homeRecordsExtraction.service.ts's warranty/
  // receipt candidates, not a fabricated per-field score.
  assert.deepEqual(data.confidence, { manufacturer: 0.72, colorCode: 0.72 });
});

test('runPhotoExtraction never creates a review row when nothing was actually extracted', async () => {
  existingPhotoCount = 0;
  analyzeMaterialPhotoResult = { candidateFields: {}, confidence: 0 };
  extractionReviewCreateCalls.length = 0;

  await service.uploadPhoto('property-1', 'spec-1', 'user-1', file);
  await flushMicrotasks();

  assert.equal(extractionReviewCreateCalls.length, 0);
});

test('runPhotoExtraction failures never propagate out of uploadPhoto — the photo upload itself already succeeded', async () => {
  existingPhotoCount = 0;
  analyzeMaterialPhotoError = new Error('AI service unavailable');
  extractionReviewCreateCalls.length = 0;

  const photo = await service.uploadPhoto('property-1', 'spec-1', 'user-1', file);
  assert.equal(photo.id, 'photo-1');

  await flushMicrotasks();
  assert.equal(extractionReviewCreateCalls.length, 0);

  analyzeMaterialPhotoError = null;
});
