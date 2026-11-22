import { UpstreamServiceError } from '../core/errors.js';
import type { BudgetSnapshot } from '../types/notification.js';

export interface BudgetClient {
  findByCategory(category: string): Promise<BudgetSnapshot[]>;
}

export interface HttpBudgetClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

interface BudgetsApiResponse {
  budgets?: unknown;
}

function isBudgetSnapshot(value: unknown): value is BudgetSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.limitAmount === 'number' &&
    Number.isFinite(candidate.limitAmount) &&
    typeof candidate.period === 'string' &&
    typeof candidate.currency === 'string'
  );
}

/** HTTP client that queries budgets-service to retrieve category budgets. */
export class HttpBudgetClient implements BudgetClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: HttpBudgetClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  async findByCategory(category: string): Promise<BudgetSnapshot[]> {
    const url = `${this.baseUrl}/budgets?category=${encodeURIComponent(category.trim())}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new UpstreamServiceError(
        'No se pudo conectar con budgets-service para verificar el presupuesto.'
      );
    }

    if (!response.ok) {
      throw new UpstreamServiceError(
        `budgets-service respondió con estado ${response.status} al consultar presupuestos.`
      );
    }

    let payload: BudgetsApiResponse;
    try {
      payload = (await response.json()) as BudgetsApiResponse;
    } catch {
      throw new UpstreamServiceError('Respuesta JSON inválida recibida desde budgets-service.');
    }

    if (!Array.isArray(payload.budgets) || !payload.budgets.every(isBudgetSnapshot)) {
      throw new UpstreamServiceError('Formato de presupuestos inesperado desde budgets-service.');
    }

    return payload.budgets.map((budget) => ({ ...budget }));
  }
}
