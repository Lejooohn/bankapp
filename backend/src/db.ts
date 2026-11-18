import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool, types } = pg;

// PostgreSQL DATE (oid 1082) : garder la chaîne "YYYY-MM-DD" brute au lieu de
// laisser pg la convertir en objet Date JS (minuit heure locale du serveur),
// ce qui provoquait un décalage de fuseau horaire lors de la sérialisation JSON
// (toISOString() repasse en UTC) et faussait le groupement par mois côté frontend.
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// An idle client fails when PostgreSQL restarts. Without a listener, that error
// is unhandled and crashes the process; pg reconnects on the next query anyway.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

// UTF-8 is PostgreSQL's default; no connect handler needed

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        theme VARCHAR(10) DEFAULT 'light',
        theme_schedule JSONB DEFAULT '{"enabled":false,"darkHours":[false,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,true,true,true,false,false,false]}',
        language VARCHAR(5) DEFAULT 'fr',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS theme_schedule JSONB DEFAULT '{"enabled":false,"darkHours":[false,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,true,true,true,false,false,false]}';

      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        bank_name VARCHAR(100),
        description TEXT,
        balance NUMERIC(15,2) DEFAULT 0,
        sort_order INT DEFAULT 0,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        description VARCHAR(255),
        amount NUMERIC(15,2) NOT NULL,
        tiers VARCHAR(255) NOT NULL DEFAULT 'Autre',
        details TEXT,
        category VARCHAR(100),
        transaction_type VARCHAR(50),
        is_reconciled BOOLEAN DEFAULT false,
        related_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
        is_locked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(account_id, name)
      );

      CREATE TABLE IF NOT EXISTS categorization_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        pattern VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(account_id, pattern)
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        description VARCHAR(255) NOT NULL,
        amount NUMERIC(15,2) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        category VARCHAR(100),
        target_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
        frequency VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        max_occurrences INT,
        occurrences_count INT DEFAULT 0,
        day_of_month INT DEFAULT 1,
        skip_weekends BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL,
        amount NUMERIC(15,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'EUR',
        period VARCHAR(20) DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
        start_date DATE NOT NULL,
        end_date DATE,
        color VARCHAR(7) DEFAULT '#3B82F6' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_rules_account_id ON categorization_rules(account_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_account_id ON schedules(account_id);
      CREATE INDEX IF NOT EXISTS idx_categories_account_id ON categories(account_id);

      CREATE INDEX IF NOT EXISTS idx_transactions_account_deleted_date
        ON transactions(account_id, deleted_at, date DESC);

      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY DEFAULT 1,
        password_hash VARCHAR(255),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Second factor (TOTP, opt-in). The secret is encrypted with ENCRYPTION_KEY.
      CREATE TABLE IF NOT EXISTS user_totp (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        secret_enc TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        last_step BIGINT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- One-time recovery codes, stored as SHA-256 hashes.
      CREATE TABLE IF NOT EXISTS user_recovery_codes (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash VARCHAR(64) NOT NULL,
        used_at TIMESTAMP,
        PRIMARY KEY (user_id, code_hash)
      );

      -- Pending second-factor step after a correct password. Hashed token, short-lived.
      CREATE TABLE IF NOT EXISTS mfa_challenges (
        token_hash VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        attempts INT NOT NULL DEFAULT 0
      );

      -- Devices that completed a second factor with "remember this device" (cookie, hashed).
      CREATE TABLE IF NOT EXISTS trusted_devices (
        token_hash VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        last_used TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
    `);

    // Additive migration: schedule_id for idempotent generation
    await client.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_transactions_schedule_id ON transactions(schedule_id) WHERE schedule_id IS NOT NULL`
    );

    // Additive migration: details field for schedules
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS details TEXT NULL`
    );

    // Additive migration: Next schedule date and payment tracking
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS next_schedule_date DATE`
    );
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS expected_payments INT`
    );
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS payments_completed INT DEFAULT 0`
    );
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false`
    );

    // Initialize next_schedule_date from start_date
    await client.query(
      `UPDATE schedules SET next_schedule_date = start_date WHERE next_schedule_date IS NULL`
    );

    // Initialize payments_completed from occurrences_count
    await client.query(
      `UPDATE schedules SET payments_completed = occurrences_count WHERE payments_completed = 0 AND occurrences_count > 0`
    );


    // Perf: partial index on category for UNION/stats queries
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_transactions_category
       ON transactions(account_id, category) WHERE deleted_at IS NULL AND category IS NOT NULL`
    );
    // Perf: trigram indexes for LIKE '%…%' searches on tiers/details
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    // unaccent() is STABLE, not IMMUTABLE — wrap it so it can be used in index expressions
    await client.query(`
      CREATE OR REPLACE FUNCTION immutable_unaccent(text)
      RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT public.unaccent($1) $$
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_transactions_tiers_trgm
       ON transactions USING GIN (immutable_unaccent(lower(tiers)) gin_trgm_ops)`
    );

    // Add missing columns for inter-account transfers (migrations)
    await client.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS related_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE schedules ADD COLUMN IF NOT EXISTS target_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description TEXT
    `);
    await client.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE
    `);

    // Initialize sort_order for existing accounts (if all are 0)
    const checkSort = await client.query('SELECT COUNT(*) FROM accounts WHERE sort_order > 0');
    if (checkSort.rows[0].count === '0') {
      await client.query(`
        UPDATE accounts SET sort_order = (
          SELECT COUNT(*) FROM accounts a2 WHERE a2.created_at <= accounts.created_at
        )
      `);
    }

    // Additive migration: is_active flag for schedules (default true)
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`
    );

    // Additive migration: account_type for different account behaviors
    await client.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'checking'`
    );

    // Multi-profile support: Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        theme VARCHAR(10) DEFAULT 'light',
        language VARCHAR(5) DEFAULT 'fr',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Multi-profile support: Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Admin/user roles: Add role column (defaults to 'user')
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`
    );

    // Bootstrap: promote BOOTSTRAP_ADMIN_USERNAME to admin if no admin exists yet (unset = no bootstrap)
    const bootstrapAdmin = (process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
    if (bootstrapAdmin) {
      await client.query(
        `UPDATE users SET role = 'admin' WHERE username = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`,
        [bootstrapAdmin]
      );
    }

    // Multi-profile support: Add user_id to accounts
    await client.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );

    // Multi-profile support: Add user_id to categories
    await client.query(
      `ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );

    // Multi-profile support: Add user_id to rules
    await client.query(
      `ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );

    // Multi-profile support: Add user_id to schedules
    await client.query(
      `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );

    // Multi-profile support: Add user_id to budgets
    await client.query(
      `ALTER TABLE budgets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );

    // Multi-profile support: Add user_id to transactions
    await client.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );

    // Multi-profile support: Add indexes for user queries
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_rules_user_id ON categorization_rules(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_budgets_account_id ON budgets(account_id)`
    );

    // Multi-profile support: Create default admin user if no users exist
    // NOTE: Opt-in only (SEED_DEV_ADMIN=true). Otherwise users are created via the registration endpoint.
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    if (userCount.rows[0].count === '0' && process.env.SEED_DEV_ADMIN === 'true' && process.env.NODE_ENV !== 'production') {
      // Dev-only default: password is "admin". NEVER use in production!
      const defaultHash = await bcrypt.hash('admin', 10);
      await client.query(
        'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3)',
        ['admin', defaultHash, 'admin@localhost']
      );
      console.log('✓ Created default dev admin user (dev only)');
    }

    // Multi-profile support: Migrate existing data to default user
    const defaultUser = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (defaultUser.rows.length > 0) {
      const userId = defaultUser.rows[0].id;
      // Only update if user_id is NULL (first migration)
      await client.query(
        'UPDATE accounts SET user_id = $1 WHERE user_id IS NULL',
        [userId]
      );
      await client.query(
        'UPDATE categories SET user_id = $1 WHERE user_id IS NULL',
        [userId]
      );
      await client.query(
        'UPDATE categorization_rules SET user_id = $1 WHERE user_id IS NULL',
        [userId]
      );
      await client.query(
        'UPDATE schedules SET user_id = $1 WHERE user_id IS NULL',
        [userId]
      );
      await client.query(
        'UPDATE budgets SET user_id = $1 WHERE user_id IS NULL',
        [userId]
      );
      // transactions.user_id is derived from accounts
      await client.query(`
        UPDATE transactions SET user_id = (
          SELECT user_id FROM accounts WHERE id = transactions.account_id
        ) WHERE user_id IS NULL
      `);
    }

    // Additive migration: split pattern into tiers_pattern + details_pattern
    await client.query(`
      ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS tiers_pattern VARCHAR(255)
    `);
    await client.query(`
      ALTER TABLE categorization_rules ADD COLUMN IF NOT EXISTS details_pattern VARCHAR(255)
    `);
    // Check if pattern column exists and migrate data to tiers_pattern
    const patternColumnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'categorization_rules' AND column_name = 'pattern'
    `);
    if (patternColumnCheck.rows.length > 0) {
      try {
        await client.query(`
          UPDATE categorization_rules
          SET tiers_pattern = pattern
          WHERE tiers_pattern IS NULL AND pattern IS NOT NULL
        `);
      } catch (e: any) {
        // Ignore migration errors
        console.log('Migration warning: could not migrate pattern to tiers_pattern:', e.message);
      }
    }
    // Drop old UNIQUE constraint if it exists (depends on pattern column)
    try {
      await client.query(`ALTER TABLE categorization_rules DROP CONSTRAINT IF EXISTS categorization_rules_account_id_pattern_key`);
    } catch (e: any) {
      // Ignore if constraint doesn't exist or depends on pattern column
      console.log('Migration warning: could not drop old constraint:', e.message);
    }
    // Drop old pattern column if it exists
    try {
      await client.query(`ALTER TABLE categorization_rules DROP COLUMN IF EXISTS pattern`);
    } catch (e: any) {
      // Silently ignore if constraint depends on it or already dropped
      console.log('Migration warning: could not drop pattern column:', e.message);
    }
    // Create new UNIQUE constraint on (account_id, tiers_pattern, details_pattern) if not exists
    const constraintCheck = await client.query(`
      SELECT constraint_name FROM information_schema.table_constraints 
      WHERE table_name = 'categorization_rules' AND constraint_name = 'categorization_rules_account_tiers_details_key'
    `);
    if (constraintCheck.rows.length === 0) {
      try {
        await client.query(`
          ALTER TABLE categorization_rules
            ADD CONSTRAINT categorization_rules_account_tiers_details_key
            UNIQUE(account_id, tiers_pattern, details_pattern)
        `);
      } catch (e: any) {
        // Ignore if constraint already exists
        console.log('Migration warning: could not create new constraint:', e.message);
      }
    }
    // Allow tiers_pattern to be nullable only if NOT NULL constraint exists
    try {
      await client.query(`
        ALTER TABLE categorization_rules ALTER COLUMN tiers_pattern DROP NOT NULL
      `);
    } catch (e: any) {
      // Ignore if column is already nullable or doesn't exist
      console.log('Migration warning: could not alter tiers_pattern column:', e.message);
    }

    // Startup cleanup: purge soft-deleted transactions older than 30 days
    await client.query(
      `DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`
    );

    // Initial-balance transactions: immutable ledger row shown for a non-zero starting balance
    await client.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false`
    );

    // Backfill: accounts created before the above column existed still carry their
    // starting balance on accounts.balance instead of a locked transaction. Convert
    // them once — idempotent since balance is zeroed right after (re-running finds balance = 0).
    const legacyBalances = await client.query(
      `SELECT id, user_id, balance, created_at FROM accounts WHERE balance != 0`
    );
    for (const acc of legacyBalances.rows) {
      await client.query('BEGIN');
      try {
        await client.query(
          `INSERT INTO transactions (account_id, user_id, date, description, tiers, details, amount, transaction_type, is_reconciled, is_locked)
           VALUES ($1, $2, $3::timestamp::date, $4, $4, NULL, $5, 'Solde initial', true, true)`,
          [acc.id, acc.user_id, acc.created_at, 'Solde initial', acc.balance]
        );
        await client.query(`UPDATE accounts SET balance = 0 WHERE id = $1`, [acc.id]);
        await client.query('COMMIT');
      } catch (e: any) {
        await client.query('ROLLBACK');
        console.log('Migration warning: could not backfill initial balance for account', acc.id, e.message);
      }
    }

    // Backup tracking table. filename is unique on its own (one row per physical
    // dump file — the sidecar and createManualBackup both name files uniquely by
    // timestamp), not per (user_id, filename): that composite would let the same
    // file be "created" twice for two different users, which can't happen.
    await client.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Migration: Fix schedules stuck in September 2026
    // Bug: day_of_month changes left dates in past months instead of advancing to next month.
    // Correction: Move all active schedules with next_schedule_date in September 2026 to October.
    await client.query(`
      CREATE OR REPLACE FUNCTION compute_next_schedule_date_migration(
        ref_date DATE,
        dom INT,
        skip_weekends BOOLEAN
      ) RETURNS DATE AS $$
      DECLARE
        next_date DATE;
        day_of_week INT;
      BEGIN
        next_date := DATE_TRUNC('month', ref_date)::DATE + (dom - 1) * INTERVAL '1 day'::INTERVAL;
        IF next_date < ref_date THEN
          next_date := DATE_TRUNC('month', ref_date + INTERVAL '1 month')::DATE + (dom - 1) * INTERVAL '1 day'::INTERVAL;
        END IF;
        IF skip_weekends THEN
          WHILE TRUE LOOP
            day_of_week := EXTRACT(DOW FROM next_date)::INT;
            EXIT WHEN day_of_week NOT IN (0, 6);
            next_date := next_date + INTERVAL '1 day';
          END LOOP;
        END IF;
        RETURN next_date;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      UPDATE schedules
      SET next_schedule_date = compute_next_schedule_date_migration(
        DATE '2026-10-01',
        day_of_month,
        skip_weekends
      )
      WHERE EXTRACT(YEAR FROM next_schedule_date) = 2026
        AND EXTRACT(MONTH FROM next_schedule_date) = 9
        AND is_active = true;
    `);

    console.log('✓ Database initialized');
  } finally {
    client.release();
  }
}

export default pool;
