#!/usr/bin/env node
// Sole Homeowner Interface Phase 9: records the REAL responses of the Ask destinations from a scratch database, so the browser certification
// tests serve exactly the shapes the backend produces (a contract change shows up as a changed fixture, not a silently stale mock).
//   ASK_CERT_DATABASE_URL=... node scripts/certification/captureAskContracts.js ../frontend/e2e/ask-certification/contracts
const fs = require('node:fs');
const path = require('node:path');
const { enabled, unique, seedHouseholds } = require('../../tests/certification/realDb');

if (!enabled) { console.error('Set ASK_CERT_DATABASE_URL to a scratch database (see docs/operations/ASK_CERTIFICATION_RUNBOOK.md).'); process.exit(2); }
const outDir = path.resolve(process.argv[2] || 'contracts');
const FIXTURE_PROPERTY = 'ask-property-fixture';

(async () => {
  const { prisma } = require('../../src/lib/prisma.ts');
  const w = await seedHouseholds(prisma);
  const { owner, viewer, p1, p2 } = w;
  const svc = {
    index: require('../../src/services/ask/askRecordIndex.service.ts'),
    detail: require('../../src/services/ask/askRecordDetail.service.ts'),
    collections: require('../../src/services/ask/askRecordCollections.service.ts'),
    exportReview: require('../../src/services/ask/askRecordExportReview.service.ts'),
    work: require('../../src/services/ask/askWork.service.ts'),
    saved: require('../../src/services/ask/askSaved.service.ts'),
    search: require('../../src/services/ask/askSearch.service.ts'),
    inbox: require('../../src/services/ask/askNotificationInbox.service.ts'),
    settings: require('../../src/services/ask/askNotificationSettings.service.ts'),
    intake: require('../../src/services/ask/askIntake.service.ts'),
    intakeContract: require('../../src/services/ask/askIntake.contract.ts'),
  };

  // ---- A believable home -------------------------------------------------------------------------------------------------------------------------------
  const rooms = ['Kitchen', 'Primary bedroom', 'Garage', 'Basement', 'Laundry room'];
  for (const [index, name] of rooms.entries()) await prisma.inventoryRoom.create({ data: { propertyId: p1.id, name, type: 'OTHER', sortOrder: index } }).catch(() => prisma.inventoryRoom.create({ data: { propertyId: p1.id, name, sortOrder: index } }));
  const version = (title, userId, fileName = `${title}.pdf`) => ({ create: { versionNumber: 1, storageKey: unique('k'), originalFileName: fileName, mimeType: 'application/pdf', fileSizeBytes: 48_000, sha256: unique('h').padEnd(64, '0').slice(0, 64), uploadedByUserId: userId, scanStatus: 'CLEAN' } });
  const doc = (title, recordType, visibility = 'HOUSEHOLD') => prisma.propertyRecord.create({ data: { propertyId: p1.id, title, recordType, createdByUserId: owner.id, visibility, versions: version(title, owner.id) } });
  const furnaceManual = await doc('Furnace manual', 'MANUAL');
  await doc('Roof inspection report', 'INSPECTION_REPORT');
  await doc('Deed (owner only)', 'DEED', 'OWNER_ONLY');
  for (const record of await prisma.propertyRecord.findMany({ where: { propertyId: p1.id }, include: { versions: true } })) await prisma.propertyRecord.update({ where: { id: record.id }, data: { currentVersionId: record.versions[0].id } });
  for (const [index, title] of ['Replace furnace filter', 'Clean the gutters', 'Test smoke detectors'].entries()) {
    await prisma.operationalWorkItem.create({ data: { propertyId: p1.id, workKey: `fx-${index}`, subjectType: 'PROPERTY', subjectId: p1.id, obligationType: 'MAINTENANCE_TASK', state: index === 2 ? 'IN_PROGRESS' : 'ACCEPTED', title, homeownerReason: 'Keeps the home safe and efficient.', expectedOutcome: 'Done' } });
  }
  const brief = await prisma.propertyBrief.create({ data: { propertyId: p1.id, createdByUserId: owner.id, purpose: 'HOMEOWNER_REFERENCE', title: 'Home reference brief', limitationStatement: 'Based on what is recorded today.', asOf: new Date() } });

  // Notifications: one that opens, one for a removed target, one for a home that was lost, one that needs the legacy link, one already dismissed.
  const notice = (data) => prisma.notification.create({ data: { userId: owner.id, message: 'Something changed.', ...data } });
  const item = await prisma.operationalWorkItem.findFirst({ where: { propertyId: p1.id, title: 'Replace furnace filter' } });
  const checklist = await prisma.seasonalChecklist.create({ data: { propertyId: p1.id, season: 'WINTER', year: 2026, climateRegion: 'COLD', seasonStartDate: new Date('2026-12-01'), seasonEndDate: new Date('2027-02-28') } });
  const n = {
    opens: await notice({ type: 'SEASONAL_CHECKLIST_READY', title: 'Your winter checklist is ready', entityType: 'SEASONAL_CHECKLIST', entityId: checklist.id, metadata: { propertyId: p1.id } }),
    removed: await notice({ type: 'CLAIM_SUBMITTED', title: 'Your claim was submitted', entityType: 'CLAIM', entityId: '00000000-0000-0000-0000-000000000000', metadata: { propertyId: p1.id } }),
    lost: await notice({ type: 'CLAIM_SUBMITTED', title: 'A claim on a former home', entityType: 'CLAIM', entityId: '00000000-0000-0000-0000-000000000001', metadata: { propertyId: p2.id } }),
    nothing: await notice({ type: 'A_TYPE_NOBODY_REGISTERED', title: 'General update', metadata: { propertyId: p1.id } }),
  };
  await prisma.notification.update({ where: { id: (await notice({ type: 'CLAIM_SUBMITTED', title: 'An old notice', metadata: { propertyId: p1.id } })).id }, data: { dismissedAt: new Date() } });

  // Files in the Add a file flow, in each state.
  const makeFile = async (title, recordType, mimeType, fileName) => {
    const record = await prisma.propertyRecord.create({ data: { propertyId: p1.id, title, recordType, createdByUserId: owner.id, versions: { create: { versionNumber: 1, storageKey: unique('k'), originalFileName: fileName, mimeType, fileSizeBytes: 90_000, sha256: unique('h').padEnd(64, '0').slice(0, 64), uploadedByUserId: owner.id, scanStatus: 'CLEAN' } } }, include: { versions: true } });
    await prisma.propertyRecord.update({ where: { id: record.id }, data: { currentVersionId: record.versions[0].id } });
    return { record, version: record.versions[0] };
  };
  const ctx = { propertyId: p1.id, userId: owner.id, role: 'OWNER' };
  const uploaded = await makeFile('receipt', 'OTHER', 'application/pdf', 'water-heater-receipt.pdf');
  const receipt = await makeFile('water-heater-receipt', 'RECEIPT', 'application/pdf', 'plumbing-receipt.pdf');
  await prisma.extractedFactCandidate.createMany({ data: [
    { propertyRecordVersionId: receipt.version.id, targetDomain: 'EXPENSE', fieldKey: '_documentType', proposedValue: 'RECEIPT', confidence: 0.92 },
    { propertyRecordVersionId: receipt.version.id, targetDomain: 'EXPENSE', fieldKey: 'description', proposedValue: 'Acme Plumbing', confidence: 0.92, sourceCitation: 'AI extraction', sourcePage: 1, sourceRegionJson: { box: null, excerpt: 'Paid to Acme Plumbing', basis: 'TEXT_MATCH' } },
    { propertyRecordVersionId: receipt.version.id, targetDomain: 'EXPENSE', fieldKey: 'amount', proposedValue: '1200', confidence: 0.92, sourcePage: 1, sourceRegionJson: { box: [620, 700, 660, 960], excerpt: null, basis: 'MODEL_REPORTED' } },
    { propertyRecordVersionId: receipt.version.id, targetDomain: 'EXPENSE', fieldKey: 'transactionDate', proposedValue: '2026-09-30', confidence: 0.92 },
    { propertyRecordVersionId: receipt.version.id, targetDomain: 'EXPENSE', fieldKey: 'category', proposedValue: 'REPAIR_SERVICE', confidence: 0.92 },
  ] });
  const inspection = await makeFile('roof-report', 'INSPECTION_REPORT', 'application/pdf', 'roof-inspection.pdf');
  const finding = (n, system, severity, text) => JSON.stringify({ homeSystem: system, conditionRating: 'POOR', severity, inspectorDescription: text, inspectorRecommendation: 'REPAIR', aiInterpretation: 'This should be repaired soon.', extractionConfidence: 'HIGH', location: 'North slope', estimatedCostCentsLow: 50_000, estimatedCostCentsHigh: 120_000 });
  await prisma.extractedFactCandidate.createMany({ data: [
    { propertyRecordVersionId: inspection.version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: '_inspectionDetails', proposedValue: JSON.stringify({ reportType: 'ROOF', inspectionDate: '2026-09-01' }), confidence: 1 },
    { propertyRecordVersionId: inspection.version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: 'finding:1', proposedValue: finding(1, 'ROOF', 'MAJOR', 'Shingles are lifting along the north slope.'), confidence: 0.9, sourcePage: 4, sourceRegionJson: { box: null, excerpt: 'Shingles are lifting along the north slope', basis: 'TEXT_MATCH' } },
    { propertyRecordVersionId: inspection.version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: 'finding:2', proposedValue: finding(2, 'ELECTRICAL', 'SAFETY', 'The main panel has no cover plate.'), confidence: 0.6, sourcePage: 7, sourceRegionJson: { box: null, excerpt: 'The main panel has no cover plate', basis: 'TEXT_MATCH' } },
    { propertyRecordVersionId: inspection.version.id, targetDomain: 'INSPECTION_FINDING', fieldKey: 'finding:3', proposedValue: finding(3, 'PLUMBING', 'MINOR', 'A faucet in the garage drips.'), confidence: 0.35 },
  ] });
  const label = await makeFile('label', 'PHOTO', 'image/png', 'water-heater-label.png');
  await prisma.inventoryDraftItem.create({ data: { propertyId: p1.id, userId: owner.id, manufacturer: 'Rheem', modelNumber: 'XE50M09', serialNumber: null, confidenceJson: { manufacturer: 0.82, modelNumber: 0.71 }, explanationJson: { intake: { recordId: label.record.id, versionId: label.version.id } } } });

  // ---- Capture ---------------------------------------------------------------------------------------------------------------------------------------------------
  const out = {};
  const add = (name, value) => { out[name] = value; };
  add('recordIndex', await svc.index.getAskRecordIndex(owner.id, p1.id));
  add('recordRooms', await svc.collections.getAskRecordCollectionPage(owner.id, p1.id, 'rooms', { limit: 50 }));
  add('recordDocuments', await svc.collections.getAskRecordCollectionPage(owner.id, p1.id, 'documents', { limit: 50 }));
  add('recordDocumentsViewer', await svc.collections.getAskRecordCollectionPage(viewer.id, p1.id, 'documents', { limit: 50 }));
  add('recordDetailManual', await svc.detail.getAskRecordDetail(owner.id, p1.id, 'documents', furnaceManual.id));
  add('exportReviewOwner', await svc.exportReview.getAskRecordExportReview(owner.id, p1.id));
  add('exportReviewViewer', await svc.exportReview.getAskRecordExportReview(viewer.id, p1.id));
  add('workNeedsYou', await svc.work.getAskWorkPage(owner.id, p1.id, { view: 'NEEDS_YOU' }));
  add('workActive', await svc.work.getAskWorkPage(owner.id, p1.id, { view: 'ACTIVE' }));
  add('savedPage', await svc.saved.getAskSavedPage(owner.id, p1.id, {}));
  add('savedResolveBrief', await svc.saved.resolveAskSavedArtifactForUser(owner.id, p1.id, `brief:${brief.id}`));
  add('savedResolveSeasonal', await svc.saved.resolveAskSavedArtifactForUser(owner.id, p1.id, `seasonal:${checklist.id}`));
  add('searchFurnace', await svc.search.searchAsk(owner.id, p1.id, 'furnace'));
  add('notifications', await svc.inbox.listAskNotifications(owner.id, {}));
  add('notificationsDismissed', await svc.inbox.listAskNotifications(owner.id, { view: 'DISMISSED' }));
  add('notificationSettings', await svc.settings.getAskNotificationSettings(owner.id));
  add('notificationOpens', await svc.inbox.openAskNotification(owner.id, n.opens.id));
  add('notificationRemoved', await svc.inbox.openAskNotification(owner.id, n.removed.id));
  add('notificationLost', await svc.inbox.openAskNotification(owner.id, n.lost.id));
  add('notificationNothing', await svc.inbox.openAskNotification(owner.id, n.nothing.id));
  add('notificationIds', { opens: n.opens.id, removed: n.removed.id, lost: n.lost.id, nothing: n.nothing.id });
  add('intakeUploaded', await svc.intake.getAskIntake(ctx, uploaded.record.id));
  add('intakeReceipt', await svc.intake.getAskIntake(ctx, receipt.record.id));
  add('intakeInspection', await svc.intake.getAskIntake(ctx, inspection.record.id));
  add('intakeLabel', await svc.intake.getAskIntake(ctx, label.record.id));
  add('intakeConfig', JSON.parse(JSON.stringify({ contractVersion: svc.intakeContract.ASK_INTAKE_CONTRACT_VERSION, acceptedTypes: svc.intakeContract.ASK_INTAKE_ACCEPTED_TYPES, maxBytes: svc.intakeContract.ASK_INTAKE_MAX_BYTES, sensitivities: svc.intakeContract.ASK_INTAKE_SENSITIVITIES, kinds: svc.intakeContract.ASK_INTAKE_KIND_OPTIONS, reportTypes: svc.intakeContract.ASK_INTAKE_INSPECTION_REPORT_TYPES, disclosures: svc.intakeContract.ASK_INTAKE_DISCLOSURES, safetyChecks: { engine: 'NONE', statement: 'Files are checked for a mismatched type, embedded programs and active content. No antivirus engine is connected, so this is not a full malware scan.' } })));
  add('ids', { furnaceManual: furnaceManual.id, brief: brief.id, seasonal: checklist.id, workItem: item.id, uploaded: uploaded.record.id, receipt: receipt.record.id, inspection: inspection.record.id, label: label.record.id });

  // The browser fixtures use one stable home id and user, regardless of the database ids.
  let json = JSON.stringify(out);
  json = json.split(p1.id).join(FIXTURE_PROPERTY).split(p2.id).join('ask-other-property-fixture').split(owner.id).join('user-fixture');
  const parsed = JSON.parse(json);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, value] of Object.entries(parsed)) fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`captured ${Object.keys(parsed).length} contracts into ${outDir}`);
  await prisma.$disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
