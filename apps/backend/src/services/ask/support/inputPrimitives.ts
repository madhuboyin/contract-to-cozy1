// Ask handler support: small input primitives shared by the command input modules, so neither imports the other (FRD v1.364).
import { z } from 'zod';

export const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((value) => (value ? value : null));
