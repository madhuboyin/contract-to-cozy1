// apps/backend/src/refinanceRadar/engine/mortgageRate.service.ts
//
// Handles mortgage rate snapshot ingestion, retrieval, and trend computation.
// This is the data-access layer for market rate history.

import { MortgageRateSource, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  RATE_TREND_LOOKBACK_SNAPSHOTS,
} from '../config/refinanceRadar.config';
import { MortgageRateSnapshotDTO, RateTrendSummary } from '../types/refinanceRadar.types';

// ─── DTO Mapper ───────────────────────────────────────────────────────────────

function toSnapshotDTO(row: {
  id: string;
  date: Date;
  rate30yr: number;
  rate15yr: number;
  source: MortgageRateSource;
  sourceRef: string | null;
  createdAt: Date;
}): MortgageRateSnapshotDTO {
  const d = row.date;
  // Format as YYYY-MM-DD in UTC
  const dateStr = d.toISOString().split('T')[0];
  return {
    id: row.id,
    date: dateStr,
    rate30yr: row.rate30yr,
    rate15yr: row.rate15yr,
    source: row.source,
    sourceRef: row.sourceRef,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Ingestion Input ──────────────────────────────────────────────────────────

export interface IngestSnapshotInput {
  date: string;                          // YYYY-MM-DD
  rate30yr: number;
  rate15yr: number;
  source: MortgageRateSource;
  sourceRef?: string;
  metadataJson?: Record<string, unknown>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MortgageRateService {
  /**
   * Ingest a market rate snapshot.
   * Safe to call repeatedly — deduplicates on (source, date). Returns existing
   * record if already present; creates and returns new record otherwise.
   */
  async ingestSnapshot(
    input: IngestSnapshotInput,
  ): Promise<{ snapshot: MortgageRateSnapshotDTO; created: boolean }> {
    // Normalize to midnight UTC so the @db.Date comparison is stable
    const date = new Date(`${input.date}T00:00:00.000Z`);

    const existing = await prisma.mortgageRateSnapshot.findUnique({
      where: { source_date: { source: input.source, date } },
    });

    if (existing) {
      return { snapshot: toSnapshotDTO(existing), created: false };
    }

    const created = await prisma.mortgageRateSnapshot.create({
      data: {
        date,
        rate30yr: input.rate30yr,
        rate15yr: input.rate15yr,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });

    return { snapshot: toSnapshotDTO(created), created: true };
  }

  /**
   * Return the most recent snapshot across all sources.
   * Used as the market-rate benchmark for radar evaluations.
   */
  async getLatestSnapshot(): Promise<MortgageRateSnapshotDTO | null> {
    const row = await prisma.mortgageRateSnapshot.findFirst({
      orderBy: { date: 'desc' },
    });
    return row ? toSnapshotDTO(row) : null;
  }

  /**
   * Return the most recent N snapshots, ordered newest-first.
   * Used for trend context and missed-opportunity evaluation.
   */
  async getRecentSnapshots(
    limit: number = RATE_TREND_LOOKBACK_SNAPSHOTS,
  ): Promise<MortgageRateSnapshotDTO[]> {
    const rows = await prisma.mortgageRateSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: limit,
    });
    return rows.map(toSnapshotDTO);
  }

  /**
   * Return all snapshots on or after the given date, ordered oldest-first.
   * Used for missed-opportunity lookback analysis.
   */
  async getSnapshotsSince(sinceDate: Date): Promise<MortgageRateSnapshotDTO[]> {
    const rows = await prisma.mortgageRateSnapshot.findMany({
      where: { date: { gte: sinceDate } },
      orderBy: { date: 'asc' },
    });
    return rows.map(toSnapshotDTO);
  }

  /**
   * Compute a simple rate trend summary from an ordered list of snapshots
   * (newest-first). Caller is responsible for providing the snapshot array.
   */
  computeTrendSummary(snapshots: MortgageRateSnapshotDTO[]): RateTrendSummary {
    if (snapshots.length === 0) {
      return {
        current30yr: null,
        current15yr: null,
        prior30yr: null,
        deltaWeeks: 0,
        trend30yr: 'UNKNOWN',
        trendLabel: 'No rate data available.',
      };
    }

    const latest = snapshots[0];
    const prior = snapshots.length > 1 ? snapshots[snapshots.length - 1] : null;

    const delta = prior ? +(latest.rate30yr - prior.rate30yr).toFixed(3) : 0;
    const absThreshold = 0.05; // < 0.05pp change = stable

    const deltaWeeks = prior
      ? Math.round(
          (new Date(latest.date).getTime() - new Date(prior.date).getTime()) /
            (7 * 24 * 60 * 60 * 1000),
        )
      : 0;

    let trend30yr: RateTrendSummary['trend30yr'] = 'STABLE';
    let trendLabel: string;

    const periodLabel = deltaWeeks > 0 ? ` over the past ${deltaWeeks} week${deltaWeeks !== 1 ? 's' : ''}` : '';

    if (Math.abs(delta) < absThreshold) {
      trend30yr = 'STABLE';
      trendLabel = `Rates have been relatively stable${periodLabel}. Current 30-year: ${latest.rate30yr.toFixed(3)}%.`;
    } else if (delta > 0) {
      trend30yr = 'RISING';
      trendLabel =
        `Rates have risen by ${delta.toFixed(2)}pp${periodLabel}. ` +
        `Current 30-year: ${latest.rate30yr.toFixed(3)}%.`;
    } else {
      trend30yr = 'FALLING';
      trendLabel =
        `Rates have fallen by ${Math.abs(delta).toFixed(2)}pp${periodLabel}. ` +
        `Current 30-year: ${latest.rate30yr.toFixed(3)}%.`;
    }

    return {
      current30yr: latest.rate30yr,
      current15yr: latest.rate15yr,
      prior30yr: prior?.rate30yr ?? null,
      deltaWeeks,
      trend30yr,
      trendLabel,
    };
  }
}
