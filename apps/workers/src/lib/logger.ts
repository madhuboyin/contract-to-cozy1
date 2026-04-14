import pino from 'pino';

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

function getTransport() {
  if (isDev) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,service,env',
      },
    };
  }

  return {
    target: 'pino-loki',
    options: {
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
    },
  };
}

export const logger: AppLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'workers',
    env: process.env.NODE_ENV || 'development',
  },
  transport: getTransport(),
});
