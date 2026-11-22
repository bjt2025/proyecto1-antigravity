import type { BudgetsConfig } from '../config.js';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { BudgetRepository } from '../repositories/budgetRepository.js';
import type {
  BudgetRecord,
  CreateBudgetInput,
  ListBudgetsFilter,
  ListBudgetsResult,
} from '../types/budget.js';

const MAX_CATEGORY_LENGTH = 60;
const MONTH_PERIOD_REGEX = /^(\d{4})-(\d{2})$/;
const NAMED_PERIODS = new Set(['weekly', 'monthly', 'yearly']);
const CURRENCY_REGEX = /^[A-Za-z]{3}$/;

export interface BudgetServiceDeps {
  config: BudgetsConfig;
  budgetRepository: BudgetRepository;
  logger: Logger;
}

export interface BudgetService {
  create(input: Partial<CreateBudgetInput>): Promise<BudgetRecord>;
  list(filter?: Record<string, unknown>): Promise<ListBudgetsResult>;
  getById(id: string): Promise<BudgetRecord>;
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

function validateLimitAmount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new ValidationError('El monto límite (limitAmount) debe ser un número mayor que 0.');
  }
  return raw;
}

function validatePeriod(raw: unknown, fieldLabel = 'El período (period)'): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError(
      `${fieldLabel} es obligatorio (formato YYYY-MM o 'weekly' | 'monthly' | 'yearly').`
    );
  }

  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase();
  if (NAMED_PERIODS.has(normalized)) {
    return normalized;
  }

  const monthMatch = MONTH_PERIOD_REGEX.exec(trimmed);
  if (monthMatch) {
    const month = Number.parseInt(monthMatch[2], 10);
    if (month < 1 || month > 12) {
      throw new ValidationError(`${fieldLabel} debe tener un mes válido entre 01 y 12.`);
    }
    return trimmed;
  }

  throw new ValidationError(
    `${fieldLabel} debe tener formato YYYY-MM o ser 'weekly', 'monthly' o 'yearly'.`
  );
}

function validateCurrency(raw: unknown, fallback: string): string {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !CURRENCY_REGEX.test(raw.trim())) {
    throw new ValidationError('La moneda (currency) debe ser un código ISO de 3 letras.');
  }
  return raw.trim().toUpperCase();
}

function parseListFilter(rawFilter: Record<string, unknown> = {}): ListBudgetsFilter {
  const filter: ListBudgetsFilter = {};

  if (rawFilter.category !== undefined) {
    if (typeof rawFilter.category !== 'string' || !rawFilter.category.trim()) {
      throw new ValidationError('El filtro category debe ser una cadena no vacía.');
    }
    filter.category = rawFilter.category.trim();
  }

  if (rawFilter.period !== undefined) {
    filter.period = validatePeriod(rawFilter.period, 'El filtro period');
  }

  return filter;
}

/** Coordinates creation and querying of category budgets. */
export function createBudgetService(deps: BudgetServiceDeps): BudgetService {
  const create = async (input: Partial<CreateBudgetInput>): Promise<BudgetRecord> => {
    const category = validateCategory(input?.category);
    const limitAmount = validateLimitAmount(input?.limitAmount);
    const period = validatePeriod(input?.period);
    const currency = validateCurrency(input?.currency, deps.config.defaultCurrency);

    const existing = await deps.budgetRepository.findByCategoryAndPeriod(category, period);
    if (existing) {
      throw new ConflictError(
        `Ya existe un presupuesto para la categoría '${category}' en el período '${period}'.`
      );
    }

    const budget = await deps.budgetRepository.create({
      category,
      limitAmount,
      period,
      currency,
    });

    deps.logger.info('Presupuesto creado', {
      budgetId: budget.id,
      category: budget.category,
      period: budget.period,
    });

    return budget;
  };

  const list = async (rawFilter: Record<string, unknown> = {}): Promise<ListBudgetsResult> => {
    const filter = parseListFilter(rawFilter);
    const budgets = await deps.budgetRepository.findAll(filter);
    return {
      budgets,
      total: budgets.length,
    };
  };

  const getById = async (id: string): Promise<BudgetRecord> => {
    const budgetId = id.trim();
    if (!budgetId) {
      throw new ValidationError('El identificador del presupuesto es obligatorio.');
    }

    const budget = await deps.budgetRepository.findById(budgetId);
    if (!budget) {
      throw new NotFoundError();
    }
    return budget;
  };

  return {
    create,
    list,
    getById,
  };
}
