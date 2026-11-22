export type BudgetPeriod = `${number}-${string}` | 'weekly' | 'monthly' | 'yearly';

export interface BudgetRecord {
  id: string;
  category: string;
  limitAmount: number;
  period: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetInput {
  category: string;
  limitAmount: number;
  period: string;
  currency?: string;
}

export interface ListBudgetsFilter {
  category?: string;
  period?: string;
}

export interface ListBudgetsResult {
  budgets: BudgetRecord[];
  total: number;
}
