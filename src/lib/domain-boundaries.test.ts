import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('portable domain boundary', () => {
  const directory = resolve('src/lib');
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    it(`${file} imports only domain modules and approved portable libraries`, () => {
      const source = readFileSync(resolve(directory, file), 'utf8');
      const imports = [...source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2]);
      expect(imports.every((name) => name.startsWith('./') || name === '@js-temporal/polyfill')).toBe(true);
      expect(source).not.toMatch(/\b(?:window|document|navigator|localStorage|fetch)\s*[.(\[]/);
    });
  }
});
