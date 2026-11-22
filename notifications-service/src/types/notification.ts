export type TransactionType = 'expense' | 'income';

export type AlertType = 'overspending';

export type AlertSeverity = 'critical';

export type AlertStatus = 'unread' | 'read';

export type EvaluationReason =
  | 'BUDGET_EXCEEDED'
  | 'WITHIN_BUDGET'
  | 'NO_MATCHING_BUDGET'
  | 'INCOME_IGNORED'
  | 'CURRENCY_MISMATCH'
  | 'ALREADY_PROCESSED';

export interface BudgetSnapshot {
  id: string;
  category: string;
  limitAmount: number;
  period: string;
  currency: string;
}

export interface TransactionEventInput {
  id?: string;
  transactionId?: string;
  amount: number;
  category: string;
  date: string;
  type?: TransactionType;
  currency?: string;
  description?: string;
  previousSpent?: number;
  accumulatedSpent?: number;
}

export interface NotificationRecord {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
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
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEvaluationSummary {
  category: string;
  period: string;
  trackingKey: string;
  currency: string;
  limitAmount: number;
  transactionAmount: number;
  previousSpent: number;
  totalSpent: number;
  exceededBy: number;
}

export interface TransactionEvaluationResult {
  alertGenerated: boolean;
  reason: EvaluationReason;
  budget: BudgetSnapshot | null;
  evaluation: BudgetEvaluationSummary | null;
  alert: NotificationRecord | null;
}

export interface ListNotificationsFilter {
  category?: string;
  period?: string;
  status?: AlertStatus;
}

export interface ListNotificationsResult {
  alerts: NotificationRecord[];
  total: number;
}
