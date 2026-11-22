import crypto from 'node:crypto';
import type {
  ListTransactionsFilter,
  TransactionRecord,
  TransactionType,
} from '../types/transaction.js';

export interface CreateTransactionParams {
  amount: number;
  category: string;
  date: string;
  description: string;
  type: TransactionType;
  currency: string;
}

export interface UpdateTransactionParams {
  amount?: number;
  category?: string;
  date?: string;
  description?: string;
  type?: TransactionType;
  currency?: string;
}

export interface TransactionRepository {
  create(params: CreateTransactionParams): Promise<TransactionRecord>;
  findAll(filter?: ListTransactionsFilter): Promise<TransactionRecord[]>;
  findById(id: string): Promise<TransactionRecord | null>;
  update(id: string, params: UpdateTransactionParams): Promise<TransactionRecord | null>;
}

/** Default in-memory repository for transactions-service. */
export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly transactionsById = new Map<string, TransactionRecord>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async create(params: CreateTransactionParams): Promise<TransactionRecord> {
    const timestamp = new Date(this.now()).toISOString();
    const record: TransactionRecord = {
      id: crypto.randomUUID(),
      amount: params.amount,
      category: params.category,
      date: params.date,
      description: params.description,
      type: params.type,
      currency: params.currency,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.transactionsById.set(record.id, record);
    return { ...record };
  }

  async findAll(filter: ListTransactionsFilter = {}): Promise<TransactionRecord[]> {
    const normalizedCategory = filter.category?.trim().toLowerCase();

    const items = Array.from(this.transactionsById.values()).filter((tx) => {
      if (normalizedCategory && tx.category.toLowerCase() !== normalizedCategory) {
        return false;
      }
      if (filter.type && tx.type !== filter.type) {
        return false;
      }
      if (filter.from && tx.date < filter.from) {
        return false;
      }
      if (filter.to && tx.date > filter.to) {
        return false;
      }
      return true;
    });

    items.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    return items.map((item) => ({ ...item }));
  }

  async findById(id: string): Promise<TransactionRecord | null> {
    const record = this.transactionsById.get(id);
    return record ? { ...record } : null;
  }

  async update(id: string, params: UpdateTransactionParams): Promise<TransactionRecord | null> {
    const existing = this.transactionsById.get(id);
    if (!existing) return null;

    const updated: TransactionRecord = {
      ...existing,
      ...params,
      updatedAt: new Date(this.now()).toISOString(),
    };

    this.transactionsById.set(id, updated);
    return { ...updated };
  }
}
