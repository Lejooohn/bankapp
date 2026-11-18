// Budget types and request schemas shared by the backend (validation) and the frontend (forms).
import { z } from 'zod';
import { applyZod3Messages } from './zod-config.js';

// Configure this package's Zod instance before the schemas below are created.
applyZod3Messages(z);

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Budget {
  id: string;
  account_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  start_date: string | null;
  end_date: string | null;
  color: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetWithProgress extends Budget {
  current_spent: number;
  remaining: number;
  progress_percent: number;
  transactions_count: number;
}

export interface CreateBudgetData {
  account_id: string;
  category_id?: string;
  name: string;
  amount: number;
  currency?: string;
  period?: BudgetPeriod;
  start_date?: string;
  end_date?: string;
  color?: string;
  description?: string;
}

export interface UpdateBudgetData {
  category_id?: string;
  name?: string;
  amount?: number;
  currency?: string;
  period?: BudgetPeriod;
  start_date?: string;
  end_date?: string;
  color?: string;
  description?: string;
  is_active?: boolean;
}

export const createBudgetSchema = z.object({
  category_id: z.string().uuid().optional(),
  name: z.string().min(1, 'Le nom est requis'),
  amount: z.number().positive('Le montant doit être positif'),
  currency: z.string().length(3).optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format: YYYY-MM-DD)').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide').optional(),
  description: z.string().optional()
});

export const updateBudgetSchema = z.object({
  category_id: z.string().uuid().optional(),
  name: z.string().min(1, 'Le nom est requis').optional(),
  amount: z.number().positive('Le montant doit être positif').optional(),
  currency: z.string().length(3).optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide').optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional()
});
