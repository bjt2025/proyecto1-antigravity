export type TransactionType = 'expense' | 'income';

export interface TransactionRecord {
  id: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  type: TransactionType;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionInput {
  amount: number;
  category: string;
  date: string;
  description?: string;
  type?: TransactionType;
  currency?: string;
}

export interface UpdateTransactionInput {
  amount?: number;
  category?: string;
  date?: string;
  description?: string;
  type?: TransactionType;
  currency?: string;
}

export interface ListTransactionsFilter {
  category?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
}

export interface ListTransactionsResult {
  transactions: TransactionRecord[];
  total: number;
}
