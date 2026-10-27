import { z } from 'zod';

type WithoutDefaults<Shape extends z.ZodRawShape> = {
  [Key in keyof Shape]: Shape[Key] extends z.ZodDefault<infer Inner> ? Inner : Shape[Key];
};

/**
 * Builds a PATCH schema from a create schema. Zod 4 applies `.default()` to optional
 * fields too, so a plain `.partial()` fills every field the client left out with its
 * default and the update overwrites the stored value. Dropping the defaults first keeps
 * omitted fields omitted.
 */
export function partialWithoutDefaults<
  Shape extends z.ZodRawShape,
  Config extends z.core.$ZodObjectConfig,
>(schema: z.ZodObject<Shape, Config>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.unwrap() : field,
    ]),
  ) as WithoutDefaults<Shape>;
  return schema.extend(shape).partial();
}
