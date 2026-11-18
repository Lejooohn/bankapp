export interface Account {
  id: string;
  name: string;
  bank_name?: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  tiers: string;
  details?: string | null;
  category?: string | null;
  transaction_type?: string | null;
  is_reconciled: boolean;
  schedule_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Schedule {
  id: string;
  account_id: string;
  description: string;
  amount: number;
  transaction_type: string;
  category?: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL';
  start_date: string;
  end_date?: string;
  max_occurrences?: number;
  occurrences_count: number;
  day_of_month: number;
  skip_weekends: boolean;
  created_at: string;
}

export interface CategorizationRule {
  id: string;
  account_id: string;
  pattern: string;
  category: string;
  active: boolean;
  created_at: string;
}
