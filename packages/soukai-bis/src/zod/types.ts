import type z from 'zod';
import type { ZodObject, ZodType } from 'zod';

export type SafeInferObject<T extends Record<string, ZodType>> = keyof T extends never ? {} : z.infer<ZodObject<T>>;
