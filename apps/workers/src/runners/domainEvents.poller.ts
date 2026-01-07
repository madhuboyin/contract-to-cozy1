import { processDomainEventsJob } from '../jobs/processDomainEvents.job';

type StartOpts = {
  intervalMs?: number; // default 30s
  batchSize?: number;  // default 25
};

export function startDomainEventsPoller(opts?: StartOpts) {
  const intervalMs = opts?.intervalMs ?? 30_000;
  const batchSize = opts?.batchSize ?? 25;

  // run immediately then on interval
  const runOnce = async () => {
    try {
      const res = await processDomainEventsJob({ batchSize });
      if (res.processed > 0) {
        // keep logs minimal
        console.log(`[domain-events] processed=${res.processed}`);
      }
    } catch (e: any) {
      console.error('[domain-events] error', e?.message || e);
    }
  };

  void runOnce();

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  console.log(`[domain-events] poller started intervalMs=${intervalMs} batchSize=${batchSize}`);

  return () => clearInterval(timer);
}
