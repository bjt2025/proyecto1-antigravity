import crypto from 'node:crypto';
import type { BudgetClient } from '../clients/budgetClient.js';
import type { NotificationsConfig } from '../config.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type {
  AlertStatus,
  BudgetSnapshot,
  ListNotificationsFilter,
  ListNotificationsResult,
  NotificationRecord,
  TransactionEvaluationResult,
  TransactionEventInput,
  TransactionType,
} from '../types/notification.js';

const MAX_CATEGORY_LENGTH = 60;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PERIOD_REGEX = /^(\d{4})-(\d{2})$/;
const NAMED_PERIODS = new Set(['weekly', 'monthly', 'yearly']);
const CURRENCY_REGEX = /^[A-Za-z]{3}$/;
const PERIOD_PRIORITY = ['monthly', 'weekly', 'yearly'] as const;

export interface NotificationServiceDeps {
  config: NotificationsConfig;
  budgetClient: BudgetClient;
  notificationRepository: NotificationRepository;
  logger: Logger;
}

export interface NotificationService {
  processTransactionEvent(
    input: Partial<TransactionEventInput>
  ): Promise<TransactionEvaluationResult>;
  list(filter?: Record<string, unknown>): Promise<ListNotificationsResult>;
  getById(id: string): Promise<NotificationRecord>;
  markAsRead(id: string): Promise<NotificationRecord>;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateTransactionId(input: Partial<TransactionEventInput>): {
  transactionId: string;
  isExplicit: boolean;
} {
  const raw = input.transactionId ?? input.id;
  if (raw === undefined) {
    return { transactionId: crypto.randomUUID(), isExplicit: false };
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError('El identificador de la transacción (transactionId) debe ser una cadena no vacía.');
  }
  return { transactionId: raw.trim(), isExplicit: true };
}

function validateAmount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new ValidationError('El monto (amount) debe ser un número mayor que 0.');
  }
  return roundMoney(raw);
}

function validateCategory(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('La categoría (category) es obligatoria.');
  }
  const category = raw.trim();
  if (category.length < 1 || category.length > MAX_CATEGORY_LENGTH) {
    throw new ValidationError(
      `La categoría debe tener entre 1 y ${MAX_CATEGORY_LENGTH} caracteres.`
    );
  }
  return category;
}

function validateDate(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError('La fecha (date) es obligatoria en formato YYYY-MM-DD.');
  }

  const trimmed = raw.trim();
  const dateOnlyMatch = DATE_ONLY_REGEX.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number.parseInt(dateOnlyMatch[1], 10);
    const month = Number.parseInt(dateOnlyMatch[2], 10);
    const day = Number.parseInt(dateOnlyMatch[3], 10);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day
    ) {
      throw new ValidationError('La fecha (date) no corresponde a una fecha calendario válida.');
    }
    return trimmed;
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) {
    throw new ValidationError('La fecha (date) debe tener formato YYYY-MM-DD o ISO 8601 válido.');
  }

  return new Date(parsedMs).toISOString().slice(0, 10);
}

function validateType(raw: unknown): TransactionType {
  if (raw === undefined) return 'expense';
  if (raw !== 'expense' && raw !== 'income') {
    throw new ValidationError("El tipo (type) debe ser 'expense' o 'income'.");
  }
  return raw;
}

function validateCurrency(raw: unknown, fallback: string): string {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !CURRENCY_REGEX.test(raw.trim())) {
    throw new ValidationError('La moneda (currency) debe ser un código ISO de 3 letras.');
  }
  return raw.trim().toUpperCase();
}

function validateOptionalSpent(
  raw: unknown,
  fieldName: string
): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    throw new ValidationError(`El campo ${fieldName} debe ser un número mayor o igual a 0.`);
  }
  return roundMoney(raw);
}

function validatePeriodFilter(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError(
      "El filtro period debe tener formato YYYY-MM o ser 'weekly', 'monthly' o 'yearly'."
    );
  }
  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase();
  if (NAMED_PERIODS.has(normalized)) {
    return normalized;
  }
  const match = MONTH_PERIOD_REGEX.exec(trimmed);
  if (match) {
    const month = Number.parseInt(match[2], 10);
    if (month >= 1 && month <= 12) {
      return trimmed;
    }
  }
  throw new ValidationError(
    "El filtro period debe tener formato YYYY-MM o ser 'weekly', 'monthly' o 'yearly'."
  );
}

function validateStatusFilter(raw: unknown): AlertStatus {
  if (raw !== 'unread' && raw !== 'read') {
    throw new ValidationError("El filtro status debe ser 'unread' o 'read'.");
  }
  return raw;
}

function parseListFilter(rawFilter: Record<string, unknown> = {}): ListNotificationsFilter {
  const filter: ListNotificationsFilter = {};

  if (rawFilter.category !== undefined) {
    if (typeof rawFilter.category !== 'string' || !rawFilter.category.trim()) {
      throw new ValidationError('El filtro category debe ser una cadena no vacía.');
    }
    filter.category = rawFilter.category.trim();
  }

  if (rawFilter.period !== undefined) {
    filter.period = validatePeriodFilter(rawFilter.period);
  }

  if (rawFilter.status !== undefined) {
    filter.status = validateStatusFilter(rawFilter.status);
  }

  return filter;
}

function getIsoWeekKey(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const date = new Date(
    Date.UTC(Number.parseInt(yearStr, 10), Number.parseInt(monthStr, 10) - 1, Number.parseInt(dayStr, 10))
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

function resolveMatchingBudget(
  budgets: BudgetSnapshot[],
  category: string,
  date: string
): BudgetSnapshot | null {
  const normalizedCategory = category.trim().toLowerCase();
  const categoryBudgets = budgets.filter(
    (budget) => budget.category.trim().toLowerCase() === normalizedCategory
  );
  if (categoryBudgets.length === 0) return null;

  const yearMonth = date.slice(0, 7);
  const exactMonthMatch = categoryBudgets.find((budget) => budget.period === yearMonth);
  if (exactMonthMatch) return exactMonthMatch;

  for (const period of PERIOD_PRIORITY) {
    const match = categoryBudgets.find((budget) => budget.period.toLowerCase() === period);
    if (match) return match;
  }

  return null;
}

function resolveTrackingKey(budgetPeriod: string, date: string): string {
  const normalized = budgetPeriod.toLowerCase();
  if (normalized === 'monthly') return date.slice(0, 7);
  if (normalized === 'yearly') return date.slice(0, 4);
  if (normalized === 'weekly') return getIsoWeekKey(date);
  return budgetPeriod;
}

/** Evaluates incoming transaction events against category budgets and manages overspending alerts. */
export function createNotificationService(
  deps: NotificationServiceDeps
): NotificationService {
  const processTransactionEvent = async (
    input: Partial<TransactionEventInput>
  ): Promise<TransactionEvaluationResult> => {
    const { transactionId, isExplicit } = validateTransactionId(input ?? {});
    const amount = validateAmount(input?.amount);
    const category = validateCategory(input?.category);
    const date = validateDate(input?.date);
    const type = validateType(input?.type);
    const currency = validateCurrency(input?.currency, deps.config.defaultCurrency);
    const previousSpentInput = validateOptionalSpent(input?.previousSpent, 'previousSpent');
    const accumulatedSpentInput = validateOptionalSpent(
      input?.accumulatedSpent,
      'accumulatedSpent'
    );

    if (previousSpentInput !== undefined && accumulatedSpentInput !== undefined) {
      throw new ValidationError(
        'No envíes previousSpent y accumulatedSpent simultáneamente.'
      );
    }

    if (accumulatedSpentInput !== undefined && accumulatedSpentInput < amount) {
      throw new ValidationError(
        'El campo accumulatedSpent no puede ser menor al monto de la transacción actual.'
      );
    }

    if (type === 'income') {
      deps.logger.info('Evento de ingreso ignorado para evaluación de sobregasto', {
        transactionId,
        category,
      });
      return {
        alertGenerated: false,
        reason: 'INCOME_IGNORED',
        budget: null,
        evaluation: null,
        alert: null,
      };
    }

    if (isExplicit && (await deps.notificationRepository.hasProcessedTransaction(transactionId))) {
      deps.logger.info('Evento de transacción duplicado omitido', {
        transactionId,
        category,
      });
      return {
        alertGenerated: false,
        reason: 'ALREADY_PROCESSED',
        budget: null,
        evaluation: null,
        alert: null,
      };
    }

    const candidateBudgets = await deps.budgetClient.findByCategory(category);
    const matchedBudget = resolveMatchingBudget(candidateBudgets, category, date);

    if (!matchedBudget) {
      deps.logger.info('Sin presupuesto coincidente para la transacción', {
        transactionId,
        category,
        date,
      });
      return {
        alertGenerated: false,
        reason: 'NO_MATCHING_BUDGET',
        budget: null,
        evaluation: null,
        alert: null,
      };
    }

    if (matchedBudget.currency.toUpperCase() !== currency) {
      deps.logger.warn('Moneda de transacción distinta a la del presupuesto', {
        transactionId,
        budgetId: matchedBudget.id,
        budgetCurrency: matchedBudget.currency,
        transactionCurrency: currency,
      });
      return {
        alertGenerated: false,
        reason: 'CURRENCY_MISMATCH',
        budget: matchedBudget,
        evaluation: null,
        alert: null,
      };
    }

    const trackingKey = resolveTrackingKey(matchedBudget.period, date);

    let previousSpent: number;
    let totalSpent: number;

    if (previousSpentInput !== undefined) {
      previousSpent = previousSpentInput;
      totalSpent = roundMoney(previousSpent + amount);
    } else if (accumulatedSpentInput !== undefined) {
      totalSpent = accumulatedSpentInput;
      previousSpent = roundMoney(totalSpent - amount);
    } else {
      previousSpent = await deps.notificationRepository.getAccumulatedSpent(category, trackingKey);
      totalSpent = await deps.notificationRepository.addSpent(category, trackingKey, amount);
    }

    if (isExplicit) {
      await deps.notificationRepository.markTransactionProcessed(transactionId);
    }

    const exceededBy = roundMoney(Math.max(0, totalSpent - matchedBudget.limitAmount));
    const evaluation = {
      category: matchedBudget.category,
      period: matchedBudget.period,
      trackingKey,
      currency: matchedBudget.currency,
      limitAmount: matchedBudget.limitAmount,
      transactionAmount: amount,
      previousSpent,
      totalSpent,
      exceededBy,
    };

    if (totalSpent <= matchedBudget.limitAmount) {
      deps.logger.info('Transacción dentro del presupuesto', {
        transactionId,
        budgetId: matchedBudget.id,
        totalSpent,
        limitAmount: matchedBudget.limitAmount,
      });
      return {
        alertGenerated: false,
        reason: 'WITHIN_BUDGET',
        budget: matchedBudget,
        evaluation,
        alert: null,
      };
    }

    const message = `Sobregasto en ${matchedBudget.category} (${matchedBudget.period}): gasto acumulado ${totalSpent} ${matchedBudget.currency} supera el límite de ${matchedBudget.limitAmount} ${matchedBudget.currency} por ${exceededBy} ${matchedBudget.currency}.`;

    const alert = await deps.notificationRepository.create({
      type: 'overspending',
      severity: 'critical',
      transactionId,
      budgetId: matchedBudget.id,
      category: matchedBudget.category,
      period: matchedBudget.period,
      currency: matchedBudget.currency,
      limitAmount: matchedBudget.limitAmount,
      transactionAmount: amount,
      previousSpent,
      totalSpent,
      exceededBy,
      message,
    });

    deps.logger.warn('Alerta de sobregasto generada', {
      alertId: alert.id,
      transactionId,
      budgetId: matchedBudget.id,
      category: matchedBudget.category,
      exceededBy,
    });

    return {
      alertGenerated: true,
      reason: 'BUDGET_EXCEEDED',
      budget: matchedBudget,
      evaluation,
      alert,
    };
  };

  const list = async (rawFilter: Record<string, unknown> = {}): Promise<ListNotificationsResult> => {
    const filter = parseListFilter(rawFilter);
    const alerts = await deps.notificationRepository.findAll(filter);
    return {
      alerts,
      total: alerts.length,
    };
  };

  const getById = async (id: string): Promise<NotificationRecord> => {
    const alertId = id.trim();
    if (!alertId) {
      throw new ValidationError('El identificador de la alerta es obligatorio.');
    }

    const alert = await deps.notificationRepository.findById(alertId);
    if (!alert) {
      throw new NotFoundError();
    }
    return alert;
  };

  const markAsRead = async (id: string): Promise<NotificationRecord> => {
    const alertId = id.trim();
    if (!alertId) {
      throw new ValidationError('El identificador de la alerta es obligatorio.');
    }

    const alert = await deps.notificationRepository.markAsRead(alertId);
    if (!alert) {
      throw new NotFoundError();
    }
    return alert;
  };

  return {
    processTransactionEvent,
    list,
    getById,
    markAsRead,
  };
}
