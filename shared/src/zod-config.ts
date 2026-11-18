// Zod 4 changed the wording of its default validation messages. The frontend shows these
// messages in forms, so the Zod 3 wording is kept. This config is applied to every Zod
// instance that validates BankApp input (the backend's and the one bundled in this package),
// so both sides report the same messages.
//
// Must run before any schema is created with that instance.
import type { z as zod } from 'zod';

function receivedType(input: unknown): string {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  if (typeof input === 'number' && Number.isNaN(input)) return 'nan';
  return typeof input;
}

export function applyZod3Messages(z: typeof zod): void {
  z.config({
    customError: (issue) => {
      if (issue.code === 'invalid_type') {
        if (issue.input === undefined) return 'Required';
        return `Expected ${issue.expected}, received ${receivedType(issue.input)}`;
      }
      if (issue.code === 'invalid_value' && Array.isArray((issue as { values?: unknown[] }).values)) {
        if (issue.input === undefined) return 'Required';
        const values = (issue as { values: unknown[] }).values;
        return `Invalid enum value. Expected ${values.map((v) => `'${String(v)}'`).join(' | ')}, received '${String(issue.input)}'`;
      }
      return undefined;
    },
  });
}
