import type { CreateTransactionInput, Transaction } from '../types';
import { getStoredSession } from './auth';

const TRANSACTIONS_SERVICE_URL = (
  import.meta.env.VITE_TRANSACTIONS_SERVICE_URL || 'http://localhost:3002'
).replace(/\/+$/, '');

interface ApiErrorBody {
  error?: string;
}

async function requestTransactions<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getStoredSession();
  let response: Response;
  try {
    response = await fetch(`${TRANSACTIONS_SERVICE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      'No se pudo conectar con transactions-service. Verifica que esté activo.'
    );
  }

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error || 'Error al comunicarse con transactions-service.');
  }

  return data;
}

/** Fetches all transactions from transactions-service, optionally filtered by category. */
export async function fetchTransactions(category?: string): Promise<Transaction[]> {
  const query = category?.trim()
    ? `?category=${encodeURIComponent(category.trim())}`
    : '';
  const data = await requestTransactions<{ transactions: Transaction[] }>(
    `/transactions${query}`,
    { method: 'GET' }
  );
  return data.transactions;
}

/** Registers a new transaction in transactions-service. */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<Transaction> {
  const data = await requestTransactions<{ transaction: Transaction }>(
    '/transactions',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return data.transaction;
}
