import { expect, test } from 'vitest';
import { parseTimeline, timelineSchema } from './gemini';
import { record } from './parsing';

test('Gemini request schema stays within the shape validated live on the affiliate video', () => {
  const keywords = new Set([
    'type',
    'additionalProperties',
    'properties',
    'required',
    'items',
    'enum',
  ]);
  let deepest = 0;
  function check(value: unknown, depth: number) {
    const schema = record(value);
    deepest = Math.max(deepest, depth);
    expect(depth).toBeLessThanOrEqual(4);
    expect(Object.keys(schema).every((key) => keywords.has(key))).toBe(true);
    expect(schema).not.toHaveProperty('maxItems');
    expect(['object', 'array', 'string', 'number']).toContain(schema.type);
    if (schema.properties)
      for (const child of Object.values(record(schema.properties))) check(child, depth + 1);
    if (schema.items) check(schema.items, depth + 1);
  }
  check(timelineSchema, 1);
  expect(deepest).toBe(4);
});

test('the parser keeps the event cap outside the provider schema', () => {
  const event = {
    start: 20,
    end: 22,
    kind: 'on_screen_text',
    text: 'Rates and terms',
    notes: 'End card',
    size: 'small',
    contrast: 'low',
    position: 'bottom',
  };
  expect(parseTimeline({ events: Array.from({ length: 400 }, () => event) })).toHaveLength(400);
  expect(() => parseTimeline({ events: Array.from({ length: 401 }, () => event) })).toThrow();
});

test('character events retain attributed context without becoming transcript quotes', () => {
  const character = {
    start: 0,
    end: 4,
    kind: 'character',
    text: '',
    who: 'customer/testimonial actor',
    doing: 'holds a phone showing the app',
    says_gist: 'Context paraphrase: describes obtaining a loan',
    notes: 'Role inferred from presentation.',
  };
  expect(parseTimeline({ events: [character] })).toEqual([character]);
  expect(timelineSchema.properties.events.items.properties.kind.enum).toEqual([
    'on_screen_text',
    'character',
    'visual',
    'scene',
  ]);
  expect(timelineSchema.properties.events.items.properties).not.toHaveProperty('prominence');
});
