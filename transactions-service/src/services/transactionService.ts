import type { TransactionsConfig } from '../config.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type {
  TransactionRepository,
  UpdateTransactionParams,
} from '../repositories/transactionRepository.js';
import type {
  CreateTransactionInput,
  ListTransactionsFilter,
  ListTransactionsResult,
  TransactionRecord,
  TransactionType,
  UpdateTransactionInput,
} from '../types/transaction.js';

const MAX_CATEGORY_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 200;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const CURRENCY_REGEX = /^[A-Za-z]{3}$/;

export interface TransactionServiceDeps {
  config: TransactionsConfig;
  transactionRepository: TransactionRepository;
  logger: Logger;
}

export interface TransactionService {
  create(input: Partial<CreateTransactionInput>): Promise<TransactionRecord>;
  list(filter?: Record<string, unknown>): Promise<ListTransactionsResult>;
  getById(id: string): Promise<TransactionRecord>;
  update(id: string, input: Partial<UpdateTransactionInput>): Promise<TransactionRecord>;
}

function validateAmount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new ValidationError('El monto (amount) debe ser un número mayor que 0.');
  }
  return raw;
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

function validateDate(raw: unknown, fieldLabel = 'La fecha (date)'): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError(`${fieldLabel} es obligatoria en formato YYYY-MM-DD.`);
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
      throw new ValidationError(`${fieldLabel} no corresponde a una fecha calendario válida.`);
    }
    return trimmed;
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) {
    throw new ValidationError(`${fieldLabel} debe tener formato YYYY-MM-DD o ISO 8601 válido.`);
  }

  return new Date(parsedMs).toISOString().slice(0, 10);
}

function validateDescription(raw: unknown): string {
  if (raw === undefined) return '';
  if (typeof raw !== 'string') {
    throw new ValidationError('La descripción (description) debe ser una cadena de texto.');
  }
  const description = raw.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(
      `La descripción no debe superar los ${MAX_DESCRIPTION_LENGTH} caracteres.`
    );
  }
  return description;
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

function parseListFilter(rawFilter: Record<string, unknown> = {}): ListTransactionsFilter {
  const filter: ListTransactionsFilter = {};

  if (rawFilter.category !== undefined) {
    if (typeof rawFilter.category !== 'string' || !rawFilter.category.trim()) {
      throw new ValidationError('El filtro category debe ser una cadena no vacía.');
    }
    filter.category = rawFilter.category.trim();
  }

  if (rawFilter.type !== undefined) {
    filter.type = validateType(rawFilter.type);
  }

  if (rawFilter.from !== undefined) {
    filter.from = validateDate(rawFilter.from, 'El filtro from');
  }

  if (rawFilter.to !== undefined) {
    filter.to = validateDate(rawFilter.to, 'El filtro to');
  }

  if (filter.from && filter.to && filter.from > filter.to) {
    throw new ValidationError('El filtro from no puede ser posterior al filtro to.');
  }

  return filter;
}

/** Coordinates creation, querying, and categorization of transactions. */
export function createTransactionService(deps: TransactionServiceDeps): TransactionService {
  const create = async (input: Partial<CreateTransactionInput>): Promise<TransactionRecord> => {
    const amount = validateAmount(input?.amount);
    const category = validateCategory(input?.category);
    const date = validateDate(input?.date);
    const description = validateDescription(input?.description);
    const type = validateType(input?.type);
    const currency = validateCurrency(input?.currency, deps.config.defaultCurrency);

    const transaction = await deps.transactionRepository.create({
      amount,
      category,
      date,
      description,
      type,
      currency,
    });

    deps.logger.info('Transacción registrada', {
      transactionId: transaction.id,
      category: transaction.category,
      type: transaction.type,
    });

    return transaction;
  };

  const list = async (rawFilter: Record<string, unknown> = {}): Promise<ListTransactionsResult> => {
    const filter = parseListFilter(rawFilter);
    const transactions = await deps.transactionRepository.findAll(filter);
    return {
      transactions,
      total: transactions.length,
    };
  };

  const getById = async (id: string): Promise<TransactionRecord> => {
    const transactionId = id.trim();
    if (!transactionId) {
      throw new ValidationError('El identificador de la transacción es obligatorio.');
    }

    const transaction = await deps.transactionRepository.findById(transactionId);
    if (!transaction) {
      throw new NotFoundError();
    }
    return transaction;
  };

  const update = async (
    id: string,
    input: Partial<UpdateTransactionInput>
  ): Promise<TransactionRecord> => {
    const transactionId = id.trim();
    if (!transactionId) {
      throw new ValidationError('El identificador de la transacción es obligatorio.');
    }

    const patch: UpdateTransactionParams = {};

    if (input.amount !== undefined) patch.amount = validateAmount(input.amount);
    if (input.category !== undefined) patch.category = validateCategory(input.category);
    if (input.date !== undefined) patch.date = validateDate(input.date);
    if (input.description !== undefined) patch.description = validateDescription(input.description);
    if (input.type !== undefined) patch.type = validateType(input.type);
    if (input.currency !== undefined) {
      patch.currency = validateCurrency(input.currency, deps.config.defaultCurrency);
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('Debes enviar al menos un campo válido para actualizar.');
    }

    const updated = await deps.transactionRepository.update(transactionId, patch);
    if (!updated) {
      throw new NotFoundError();
    }

    deps.logger.info('Transacción actualizada', {
      transactionId: updated.id,
      category: updated.category,
    });

    return updated;
  };

  return {
    create,
    list,
    getById,
    update,
  };
}
