export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
}

export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  currency: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTransactionInput {
  amount: number;
  category: string;
  date: string;
  description?: string;
  type?: TransactionType;
  currency?: string;
}
