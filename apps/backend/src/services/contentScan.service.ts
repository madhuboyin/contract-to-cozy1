import net from 'node:net';
import type { NextFunction, Response } from 'express';
import type { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';

// Sole Homeowner Interface Phase 7 (FR-INPUT-002): the malware-scanning boundary for the file intake.
// A ClamAV daemon (clamd) is used when CLAMAV_HOST is set. When it is not, the upload still passes the existing content-threat heuristics
// (magic bytes, embedded executables, PDF active content, the EICAR test string) and the product says plainly that no antivirus engine ran.
// When an engine IS configured it is never skipped: if it cannot be reached the upload is refused, not waved through.
//   CLEAN: the engine scanned it and found nothing.   REJECTED: the engine named a signature.   UNSCANNED: no engine is configured.
export type ContentScanOutcome =
  | { status: 'CLEAN'; engine: 'CLAMD' }
  | { status: 'REJECTED'; engine: 'CLAMD'; signature: string }
  | { status: 'UNSCANNED'; engine: 'NONE' };

const SCAN_TIMEOUT_MS = 15_000;
const CHUNK_BYTES = 64 * 1024;

export function contentScanEngine(): 'CLAMD' | 'NONE' {
  return process.env.CLAMAV_HOST?.trim() ? 'CLAMD' : 'NONE';
}

/** What the person is told about the safety checks, matching what will actually run. */
export function contentScanStatement(): string {
  return contentScanEngine() === 'CLAMD'
    ? 'Files are checked for a mismatched type, embedded programs and active content, and scanned by an antivirus engine before they are kept.'
    : 'Files are checked for a mismatched type, embedded programs and active content. No antivirus engine is connected, so this is not a full malware scan.';
}

/** The clamd INSTREAM exchange: length-prefixed chunks, a zero-length terminator, one reply line. */
export function parseClamdReply(reply: string): { status: 'CLEAN' } | { status: 'REJECTED'; signature: string } | { status: 'ERROR'; detail: string } {
  const text = reply.replace(/\0/g, '').trim();
  if (/\bOK$/.test(text)) return { status: 'CLEAN' };
  const found = /^stream:\s*(.+?)\s+FOUND$/.exec(text);
  if (found) return { status: 'REJECTED', signature: found[1] };
  return { status: 'ERROR', detail: text.slice(0, 200) };
}

function scanWithClamd(buffer: Buffer, host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let reply = '';
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    socket.setTimeout(SCAN_TIMEOUT_MS, () => fail(new Error('clamd timed out')));
    socket.on('error', fail);
    socket.on('data', (data) => { reply += data.toString('utf8'); });
    socket.on('end', () => resolve(reply));
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
        const chunk = buffer.subarray(offset, offset + CHUNK_BYTES);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length, 0);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

export async function scanContent(buffer: Buffer): Promise<ContentScanOutcome> {
  if (contentScanEngine() === 'NONE') return { status: 'UNSCANNED', engine: 'NONE' };
  const host = process.env.CLAMAV_HOST!.trim();
  const port = Number(process.env.CLAMAV_PORT) || 3310;
  let reply: string;
  try {
    reply = await scanWithClamd(buffer, host, port);
  } catch {
    throw new APIError('The file could not be checked for malware right now, so it was not added. Try again in a moment.', 503, 'ASK_INTAKE_SCAN_UNAVAILABLE');
  }
  const parsed = parseClamdReply(reply);
  if (parsed.status === 'CLEAN') return { status: 'CLEAN', engine: 'CLAMD' };
  if (parsed.status === 'REJECTED') return { status: 'REJECTED', engine: 'CLAMD', signature: parsed.signature };
  throw new APIError('The file could not be checked for malware right now, so it was not added. Try again in a moment.', 503, 'ASK_INTAKE_SCAN_UNAVAILABLE');
}

/** Runs after the content validation and before anything is stored. A rejected file is refused outright and never reaches storage. */
export async function scanIntakeUpload(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) return next();
    const outcome = await scanContent(req.file.buffer);
    if (outcome.status === 'REJECTED') {
      return res.status(422).json({ success: false, error: { code: 'ASK_INTAKE_MALWARE_DETECTED', message: 'This file was blocked because it may be harmful. It was not added.' } });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
