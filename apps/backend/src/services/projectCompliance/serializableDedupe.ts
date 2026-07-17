import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export async function withSerializableDedupe<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') {
        throw error;
      }
    }
  }
  throw lastError;
}
