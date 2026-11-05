import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Entry ids look like "en/apps" / "nl/apps" — the folder is the locale.
const localised = z.object({ lang: z.enum(['en', 'nl']) });

const legal = defineCollection({
  loader: glob({ base: './src/content/legal', pattern: '**/*.md' }),
  schema: localised.extend({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date(),
  }),
});

export const collections = { legal };
