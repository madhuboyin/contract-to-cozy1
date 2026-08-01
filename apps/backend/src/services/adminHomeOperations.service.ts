// apps/backend/src/services/adminHomeOperations.service.ts
//
// Item #24 (§15 "Admin tooling can inspect one work item's full source/
// execution/outcome graph"). The only existing detail route
// (GET .../home-operations/work-items/:workItemId) sits behind household
// membership with no ADMIN bypass — an admin with no household membership
// on a property gets the same 404 a stranger would. This gives admins a
// direct, property-agnostic lookup.

import { getWorkItemGraphForAdmin } from '../modules/homeOperations/infrastructure/workItemRepository';

export class AdminHomeOperationsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminHomeOperationsError';
  }
}

export async function getAdminWorkItemDetail(workItemId: string) {
  const workItem = await getWorkItemGraphForAdmin(workItemId);
  if (!workItem) {
    throw new AdminHomeOperationsError('WORK_ITEM_NOT_FOUND', `No OperationalWorkItem with id "${workItemId}".`);
  }
  return workItem;
}
