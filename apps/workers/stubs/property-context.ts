// Worker-image stub for backend-only authorized context assembly.
// PropertyMaintenanceTask.service is copied for risk/action-center jobs, which
// never call template setup. Interactive template creation remains backend-only.
export async function getPropertyContext(..._args: unknown[]): Promise<never> {
  throw new Error('Authorized Property Context assembly is not available in worker template flows');
}
