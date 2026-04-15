import { processDomainEventsJob } from '../jobs/processDomainEvents.job';
import { logger } from '../lib/logger';

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
        logger.info(`[domain-events] processed=${res.processed}`);
      }
    } catch (e: any) {
      logger.error({ err: e }, '[domain-events] error');
    }
  };

  void runOnce();

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  logger.info(`[domain-events] poller started intervalMs=${intervalMs} batchSize=${batchSize}`);

  return () => clearInterval(timer);
}
