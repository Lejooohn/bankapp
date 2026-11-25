// Zod request schemas shared across route modules. Validation stays in the route handlers.

import { z } from 'zod';
import { BACKUP_CATEGORIES, MANUAL_FILENAME_RE } from '../services/backup-files.js';

// Query of the operation list: `since` returns every operation from that day on, whatever the page size.
export const transactionListQuerySchema = z.object({
  since: z.iso.date('Format de date invalide').optional(),
});

// Level of a full dump. Optional for names that only exist in one place (older clients).
export const backupCategorySchema = z.enum(BACKUP_CATEGORIES).optional();

// Manual backups to delete: the file names the user saw, so a backup made since is never included.
export const deleteManualBackupsSchema = z.object({
  filenames: z.array(z.string().regex(MANUAL_FILENAME_RE, 'Nom de fichier de sauvegarde invalide')).min(1).max(1000),
});

// Auth routes (public, no user context required)
export const loginSchema = z.object({
  username: z.string().min(1, 'Username requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

// Password policy aligned with PCI DSS v4.0 requirement 8.3.6:
// minimum 12 characters, containing both alphabetic and numeric characters.
export const passwordSchema = z.string()
  .min(12, 'Mot de passe doit contenir au moins 12 caractères')
  .regex(/[a-z]/, 'Doit contenir au moins une minuscule')
  .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
  .regex(/[0-9]/, 'Doit contenir au moins un chiffre');

export const registerSchema = z.object({
  username: z.string().min(3, 'Username doit contenir au moins 3 caractères'),
  password: passwordSchema,
  email: z.string().email('Email invalide').optional(),
});

export const themeScheduleSchema = z.object({
  enabled: z.boolean(),
  darkHours: z.array(z.boolean()).length(24),
});

export const adminUsernameSchema = z.object({
  username: z.string().min(3, 'Username doit contenir au moins 3 caractères'),
});

export const adminPasswordSchema = z.object({
  password: passwordSchema,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Validation schemas ────────────────────────────────────────────────────────

export const accountSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  bank_name: z.string().nullable().optional(),
  balance: z.number().optional().default(0),
  account_type: z.enum(['checking', 'savings', 'investment']).optional().default('checking'),
});

export const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide'),
  tiers: z.string().min(1).default('Autre'),
  details: z.string().nullable().optional(),
  amount: z.number(),
  category: z.string().nullable().optional(),
  transaction_type: z.string().nullable().optional(),
  is_reconciled: z.boolean().optional().default(false),
});

export const ruleSchema = z.object({
  tiers_pattern: z.string().optional().nullable(),
  details_pattern: z.string().nullable().optional(),
  category: z.string().min(1, 'La catégorie est requise'),
}).refine(
  (data) => (data.tiers_pattern && data.tiers_pattern.trim().length > 0) || (data.details_pattern && data.details_pattern.trim().length > 0),
  { message: 'Au moins le tiers ou les détails doivent être remplis', path: ['tiers_pattern'] }
);

export const patchRuleSchema = z.object({
  tiers_pattern: z.string().nullable().optional(),
  details_pattern: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
}).refine(
  (data) => {
    const hasTiers = data.tiers_pattern && data.tiers_pattern.trim().length > 0;
    const hasDetails = data.details_pattern && data.details_pattern.trim().length > 0;
    return hasTiers || hasDetails;
  },
  { message: 'Au moins le tiers ou les détails doivent être remplis', path: ['tiers_pattern'] }
);

export const transferSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide'),
  amount: z.number().positive('Le montant doit être positif'),
  tiers: z.string().min(1, 'Descriptif requis').default('Transfert'),
  details: z.string().nullable().optional(),
  target_account_id: z.string().uuid('ID compte cible invalide'),
  category: z.string().nullable().optional(),
  transaction_type: z.string().default('Virement émis'),
});

export const patchTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tiers: z.string().min(1).optional(),
  details: z.string().nullable().optional(),
  amount: z.number().optional(),
  category: z.string().nullable().optional(),
  transaction_type: z.string().nullable().optional(),
  is_reconciled: z.boolean().optional(),
});

export const scheduleSchema = z.object({
  description: z.string().min(1, 'Description requise'),
  amount: z.number().positive('Montant doit être positif'),
  transaction_type: z.string().min(1, 'Type requis'),
  category: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  max_occurrences: z.number().int().positive().nullable().optional(),
  day_of_month: z.number().int().min(1).max(31).default(1),
  skip_weekends: z.boolean().default(true),
  target_account_id: z.string().uuid().nullable().optional(),
});

// Partial update: an absent field is kept as stored, an explicit null clears a nullable field.
// No defaults here, a default would overwrite the stored value.
export const patchScheduleSchema = z.object({
  description: z.string().min(1, 'Description requise').optional(),
  amount: z.number().positive('Montant doit être positif').optional(),
  transaction_type: z.string().min(1, 'Type requis').optional(),
  category: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide').nullable().optional(),
  day_of_month: z.number().int().min(1, 'Le jour du mois doit être un entier entre 1 et 31').max(31, 'Le jour du mois doit être un entier entre 1 et 31').optional(),
  skip_weekends: z.boolean().optional(),
  target_account_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

// Second factor (TOTP or recovery code). The code is normalised by the handler.
export const mfaVerifySchema = z.object({
  mfa_token: z.string().min(1).max(200),
  code: z.string().min(1).max(32),
  remember: z.boolean().optional().default(false),
});

export const mfaCodeSchema = z.object({
  code: z.string().min(1).max(32),
});

// Enrolment and confirmation re-check the password: a session token alone must not be able to
// install a second factor on the account.
export const mfaSetupSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(1).max(32).optional(),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(1).max(32),
});
