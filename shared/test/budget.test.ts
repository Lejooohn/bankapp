import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createBudgetSchema, updateBudgetSchema, applyZod3Messages } from '../src/index.js';

describe('createBudgetSchema', () => {
  it('accepts a minimal valid budget', () => {
    const r = createBudgetSchema.safeParse({ name: 'Courses', amount: 300 });
    expect(r.success).toBe(true);
  });

  it('rejects an empty name with the French message', () => {
    const r = createBudgetSchema.safeParse({ name: '', amount: 300 });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe('Le nom est requis');
  });

  it('rejects a non-positive amount with the French message', () => {
    const r = createBudgetSchema.safeParse({ name: 'x', amount: 0 });
    expect(r.error!.issues[0].message).toBe('Le montant doit être positif');
  });

  it('uses the Zod 3 wording for a type error (amount sent as string)', () => {
    const r = createBudgetSchema.safeParse({ name: 'x', amount: '12' });
    expect(r.error!.flatten().fieldErrors.amount).toEqual(['Expected number, received string']);
  });

  it('rejects a malformed start date and a bad colour', () => {
    expect(createBudgetSchema.safeParse({ name: 'x', amount: 1, start_date: '01/02/2026' }).success).toBe(false);
    expect(createBudgetSchema.safeParse({ name: 'x', amount: 1, color: 'red' }).success).toBe(false);
  });

  it('rejects an unknown period', () => {
    expect(createBudgetSchema.safeParse({ name: 'x', amount: 1, period: 'hourly' }).success).toBe(false);
  });
});

describe('updateBudgetSchema', () => {
  it('accepts a partial update including is_active', () => {
    expect(updateBudgetSchema.safeParse({ is_active: false }).success).toBe(true);
  });

  it('still validates the fields it does receive', () => {
    expect(updateBudgetSchema.safeParse({ amount: -5 }).success).toBe(false);
  });
});

describe('applyZod3Messages', () => {
  it('can be applied to another Zod instance with the same wording', () => {
    const local = z.object({ n: z.number() });
    applyZod3Messages(z);
    const r = local.safeParse({ n: 'x' });
    expect(r.error!.flatten().fieldErrors.n).toEqual(['Expected number, received string']);
  });
});
