import crypto from 'node:crypto';
import type { BudgetRecord, ListBudgetsFilter } from '../types/budget.js';

export interface CreateBudgetParams {
  category: string;
  limitAmount: number;
  period: string;
  currency: string;
}

export interface BudgetRepository {
  create(params: CreateBudgetParams): Promise<BudgetRecord>;
  findAll(filter?: ListBudgetsFilter): Promise<BudgetRecord[]>;
  findById(id: string): Promise<BudgetRecord | null>;
  findByCategoryAndPeriod(category: string, period: string): Promise<BudgetRecord | null>;
}

/** Default in-memory repository for budgets-service. */
export class InMemoryBudgetRepository implements BudgetRepository {
  private readonly budgetsById = new Map<string, BudgetRecord>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async create(params: CreateBudgetParams): Promise<BudgetRecord> {
    const timestamp = new Date(this.now()).toISOString();
    const record: BudgetRecord = {
      id: crypto.randomUUID(),
      category: params.category,
      limitAmount: params.limitAmount,
      period: params.period,
      currency: params.currency,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.budgetsById.set(record.id, record);
    return { ...record };
  }

  async findAll(filter: ListBudgetsFilter = {}): Promise<BudgetRecord[]> {
    const normalizedCategory = filter.category?.trim().toLowerCase();

    const items = Array.from(this.budgetsById.values()).filter((budget) => {
      if (normalizedCategory && budget.category.toLowerCase() !== normalizedCategory) {
        return false;
      }
      if (filter.period && budget.period !== filter.period) {
        return false;
      }
      return true;
    });

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return items.map((item) => ({ ...item }));
  }

  async findById(id: string): Promise<BudgetRecord | null> {
    const record = this.budgetsById.get(id);
    return record ? { ...record } : null;
  }

  async findByCategoryAndPeriod(category: string, period: string): Promise<BudgetRecord | null> {
    const normalizedCategory = category.trim().toLowerCase();
    for (const budget of this.budgetsById.values()) {
      if (budget.category.toLowerCase() === normalizedCategory && budget.period === period) {
        return { ...budget };
      }
    }
    return null;
  }
}
