import {
  initializeFaro,
  getWebInstrumentations,
  type Faro,
} from '@grafana/faro-web-sdk';

let faro: Faro | null = null;

export function initFaro(): void {
  if (typeof window === 'undefined') return;
  if (faro) return;

  const url = process.env.NEXT_PUBLIC_FARO_URL;
  if (!url) return;

  faro = initializeFaro({
    url,
    app: {
      name: 'contract-to-cozy-frontend',
      version: '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
    },
    instrumentations: [
      ...getWebInstrumentations({
        captureConsole: false,
      }),
    ],
  });
}

export function getFaro(): Faro | null {
  return faro;
}
