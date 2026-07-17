// Pure season-window math shared by the backend API and the workers
// generation job (the workers Docker build copies this file — see
// infrastructure/docker/workers/Dockerfile).
//
// Convention: a season's `year` is the calendar year its START date falls in.
// Winter 2026 starts Dec 21, 2026 and ends Mar 19, 2027 — so a winter in
// progress during Jan–Mar belongs to the PREVIOUS calendar year.

export type Season = 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER';

const SEASON_ORDER: Season[] = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];

export interface SeasonWindow {
  season: Season;
  year: number;
  startDate: Date;
  endDate: Date;
}

export function getNextSeason(season: Season): Season {
  return SEASON_ORDER[(SEASON_ORDER.indexOf(season) + 1) % 4];
}

export function getSeasonStartDate(season: Season, year: number): Date {
  switch (season) {
    case 'SPRING':
      return new Date(year, 2, 20); // March 20
    case 'SUMMER':
      return new Date(year, 5, 21); // June 21
    case 'FALL':
      return new Date(year, 8, 23); // September 23
    case 'WINTER':
      return new Date(year, 11, 21); // December 21
  }
}

export function getSeasonEndDate(season: Season, year: number): Date {
  switch (season) {
    case 'SPRING':
      return new Date(year, 5, 20); // June 20
    case 'SUMMER':
      return new Date(year, 8, 22); // September 22
    case 'FALL':
      return new Date(year, 11, 20); // December 20
    case 'WINTER':
      return new Date(year + 1, 2, 19); // March 19 of the following year
  }
}

/** Astronomical season for a date, aligned with the start/end dates above. */
export function getSeasonForDate(date: Date): Season {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  if ((month === 3 && day >= 20) || month === 4 || month === 5 || (month === 6 && day < 21)) {
    return 'SPRING';
  }
  if ((month === 6 && day >= 21) || month === 7 || month === 8 || (month === 9 && day < 23)) {
    return 'SUMMER';
  }
  if ((month === 9 && day >= 23) || month === 10 || month === 11 || (month === 12 && day < 21)) {
    return 'FALL';
  }
  return 'WINTER';
}

/** The season currently in progress on `today`, with its correct year. */
export function resolveCurrentSeasonWindow(today: Date): SeasonWindow {
  const season = getSeasonForDate(today);
  // A winter in progress during Jan–Mar started the previous December.
  const year =
    season === 'WINTER' && today.getMonth() < 11
      ? today.getFullYear() - 1
      : today.getFullYear();
  return {
    season,
    year,
    startDate: getSeasonStartDate(season, year),
    endDate: getSeasonEndDate(season, year),
  };
}

/** The next season to begin after `today`; startDate is always in the future. */
export function resolveUpcomingSeasonWindow(
  today: Date
): SeasonWindow & { daysUntilStart: number } {
  const season = getNextSeason(getSeasonForDate(today));
  const candidate = getSeasonStartDate(season, today.getFullYear());
  const year = candidate > today ? today.getFullYear() : today.getFullYear() + 1;
  const startDate = getSeasonStartDate(season, year);
  const daysUntilStart = Math.floor(
    (startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    season,
    year,
    startDate,
    endDate: getSeasonEndDate(season, year),
    daysUntilStart,
  };
}
