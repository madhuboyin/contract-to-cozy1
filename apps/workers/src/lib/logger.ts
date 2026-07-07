import pino from 'pino';
import pinoLoki from 'pino-loki';

// Pino v10 has strict overload types — this interface accepts both the
// structured (obj, msg) form and the legacy (msg, ...args) form.
export interface AppLogger {
  info(msgOrObj: unknown, ...args: unknown[]): void;
  warn(msgOrObj: unknown, ...args: unknown[]): void;
  error(msgOrObj: unknown, ...args: unknown[]): void;
  debug(msgOrObj: unknown, ...args: unknown[]): void;
  fatal(msgOrObj: unknown, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): AppLogger;
}

const isDev = process.env.NODE_ENV !== 'production';

// Loki gateway outages (observed in prod) used to mean zero log lines
// anywhere, since pino-loki was the sole destination. Piping both stdout
// and Loki through pino.multistream() keeps them in the main thread — unlike
// pino.transport({ targets: [...] }), which spawns one worker_threads
// instance per target and segfaulted this cluster's Raspberry Pi pods
// (see memory: fix_production_logging_pino_loki_no_stdout).
function createProdStream() {
  const lokiStream = pinoLoki({
    host: process.env.LOKI_HOST || 'http://loki-gateway.monitoring.svc.cluster.local',
    basicAuth: {
      username: process.env.LOKI_USERNAME || '',
      password: process.env.LOKI_PASSWORD || '',
    },
    headers: {
      'X-Scope-OrgID': process.env.LOKI_TENANT_ID || 'fake',
    },
    labels: {
      app: 'workers',
      env: process.env.NODE_ENV || 'production',
    },
    batching: true,
    interval: 5,
  });

  return pino.multistream([{ stream: process.stdout }, { stream: lokiStream }]);
}

const options = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'workers',
    env: process.env.NODE_ENV || 'development',
  },
};

export const logger: AppLogger = isDev
  ? pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service,env',
        },
      },
    })
  : pino(options, createProdStream());
