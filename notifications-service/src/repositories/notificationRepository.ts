import crypto from 'node:crypto';
import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ListNotificationsFilter,
  NotificationRecord,
} from '../types/notification.js';

export interface CreateNotificationParams {
  type: AlertType;
  severity: AlertSeverity;
  transactionId: string;
  budgetId: string;
  category: string;
  period: string;
  currency: string;
  limitAmount: number;
  transactionAmount: number;
  previousSpent: number;
  totalSpent: number;
  exceededBy: number;
  message: string;
}

export interface NotificationRepository {
  create(params: CreateNotificationParams): Promise<NotificationRecord>;
  findAll(filter?: ListNotificationsFilter): Promise<NotificationRecord[]>;
  findById(id: string): Promise<NotificationRecord | null>;
  markAsRead(id: string): Promise<NotificationRecord | null>;
  hasProcessedTransaction(transactionId: string): Promise<boolean>;
  markTransactionProcessed(transactionId: string): Promise<void>;
  getAccumulatedSpent(category: string, trackingKey: string): Promise<number>;
  addSpent(category: string, trackingKey: string, amount: number): Promise<number>;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSpendingKey(category: string, trackingKey: string): string {
  return `${category.trim().toLowerCase()}::${trackingKey}`;
}

/** Default in-memory repository for notifications-service. */
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly alertsById = new Map<string, NotificationRecord>();
  private readonly processedTransactionIds = new Set<string>();
  private readonly spentByPeriodKey = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async create(params: CreateNotificationParams): Promise<NotificationRecord> {
    const timestamp = new Date(this.now()).toISOString();
    const record: NotificationRecord = {
      id: crypto.randomUUID(),
      type: params.type,
      severity: params.severity,
      status: 'unread' satisfies AlertStatus,
      transactionId: params.transactionId,
      budgetId: params.budgetId,
      category: params.category,
      period: params.period,
      currency: params.currency,
      limitAmount: params.limitAmount,
      transactionAmount: params.transactionAmount,
      previousSpent: params.previousSpent,
      totalSpent: params.totalSpent,
      exceededBy: params.exceededBy,
      message: params.message,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.alertsById.set(record.id, record);
    return { ...record };
  }

  async findAll(filter: ListNotificationsFilter = {}): Promise<NotificationRecord[]> {
    const normalizedCategory = filter.category?.trim().toLowerCase();

    const items = Array.from(this.alertsById.values()).filter((alert) => {
      if (normalizedCategory && alert.category.toLowerCase() !== normalizedCategory) {
        return false;
      }
      if (filter.period && alert.period !== filter.period) {
        return false;
      }
      if (filter.status && alert.status !== filter.status) {
        return false;
      }
      return true;
    });

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return items.map((item) => ({ ...item }));
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const record = this.alertsById.get(id);
    return record ? { ...record } : null;
  }

  async markAsRead(id: string): Promise<NotificationRecord | null> {
    const existing = this.alertsById.get(id);
    if (!existing) return null;

    if (existing.status === 'read') {
      return { ...existing };
    }

    const updated: NotificationRecord = {
      ...existing,
      status: 'read',
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.alertsById.set(id, updated);
    return { ...updated };
  }

  async hasProcessedTransaction(transactionId: string): Promise<boolean> {
    return this.processedTransactionIds.has(transactionId);
  }

  async markTransactionProcessed(transactionId: string): Promise<void> {
    this.processedTransactionIds.add(transactionId);
  }

  async getAccumulatedSpent(category: string, trackingKey: string): Promise<number> {
    const key = buildSpendingKey(category, trackingKey);
    return this.spentByPeriodKey.get(key) ?? 0;
  }

  async addSpent(category: string, trackingKey: string, amount: number): Promise<number> {
    const key = buildSpendingKey(category, trackingKey);
    const current = this.spentByPeriodKey.get(key) ?? 0;
    const updated = roundMoney(current + amount);
    this.spentByPeriodKey.set(key, updated);
    return updated;
  }
}
