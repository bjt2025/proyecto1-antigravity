import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createBudgetsApp } from '../src/app.js';
import type { BudgetsConfig } from '../src/config.js';
import { createLogger } from '../src/core/logger.js';
import type { BudgetRecord } from '../src/types/budget.js';

function createTestConfig(overrides: Partial<BudgetsConfig> = {}): BudgetsConfig {
  return {
    port: 0,
    corsOrigin: 'http://localhost:5173',
    defaultCurrency: 'PEN',
    nodeEnv: 'test',
    ...overrides,
  };
}

async function startTestServer(options: {
  config?: Partial<BudgetsConfig>;
  now?: () => number;
} = {}) {
  const capturedLogs: string[] = [];
  const logger = createLogger((_level, serialized) => {
    capturedLogs.push(serialized);
  });

  const context = createBudgetsApp({
    config: createTestConfig(options.config),
    logger,
    now: options.now,
  });

  const server = http.createServer(context.app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    capturedLogs,
    context,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('budgets-service base structure', () => {
  const cleanups: Array<() => Promise<void>> = [];

  after(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
  });

  it('supports health check, creation, listing, filtering, and detail retrieval', async () => {
    let currentTimeMs = Date.parse('2026-11-21T10:00:00.000Z');
    const srv = await startTestServer({ now: () => currentTimeMs });
    cleanups.push(srv.close);

    // 1. Health check
    const healthRes = await fetch(`${srv.baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as { status: string; service: string };
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.service, 'budgets-service');

    // 2. Empty list initially
    const emptyListRes = await fetch(`${srv.baseUrl}/budgets`);
    assert.equal(emptyListRes.status, 200);
    const emptyListBody = (await emptyListRes.json()) as {
      budgets: BudgetRecord[];
      total: number;
    };
    assert.deepEqual(emptyListBody, { budgets: [], total: 0 });

    // 3. Create budget for YYYY-MM period with default currency
    const createFoodRes = await fetch(`${srv.baseUrl}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Alimentación',
        limitAmount: 800,
        period: '2026-11',
      }),
    });
    assert.equal(createFoodRes.status, 201);
    const createdFood = (await createFoodRes.json()) as { budget: BudgetRecord };
    assert.equal(createdFood.budget.category, 'Alimentación');
    assert.equal(createdFood.budget.limitAmount, 800);
    assert.equal(createdFood.budget.period, '2026-11');
    assert.equal(createdFood.budget.currency, 'PEN');
    assert.ok(createdFood.budget.id);

    // 4. Create budget with named recurring period and explicit currency
    currentTimeMs += 1000;
    const createTransportRes = await fetch(`${srv.baseUrl}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Transporte',
        limitAmount: 250.5,
        period: 'Monthly',
        currency: 'usd',
      }),
    });
    assert.equal(createTransportRes.status, 201);
    const createdTransport = (await createTransportRes.json()) as { budget: BudgetRecord };
    assert.equal(createdTransport.budget.period, 'monthly');
    assert.equal(createdTransport.budget.currency, 'USD');

    // 5. List all budgets ordered by createdAt descending
    const listAllRes = await fetch(`${srv.baseUrl}/budgets`);
    assert.equal(listAllRes.status, 200);
    const listAllBody = (await listAllRes.json()) as {
      budgets: BudgetRecord[];
      total: number;
    };
    assert.equal(listAllBody.total, 2);
    assert.deepEqual(
      listAllBody.budgets.map((b) => b.id),
      [createdTransport.budget.id, createdFood.budget.id]
    );

    // 6. Filter by category (case-insensitive) and by period
    const filteredCatRes = await fetch(
      `${srv.baseUrl}/budgets?category=${encodeURIComponent('alimentación')}`
    );
    assert.equal(filteredCatRes.status, 200);
    const filteredCatBody = (await filteredCatRes.json()) as {
      budgets: BudgetRecord[];
      total: number;
    };
    assert.equal(filteredCatBody.total, 1);
    assert.equal(filteredCatBody.budgets[0].id, createdFood.budget.id);

    const filteredPeriodRes = await fetch(`${srv.baseUrl}/budgets?period=monthly`);
    assert.equal(filteredPeriodRes.status, 200);
    const filteredPeriodBody = (await filteredPeriodRes.json()) as {
      budgets: BudgetRecord[];
      total: number;
    };
    assert.equal(filteredPeriodBody.total, 1);
    assert.equal(filteredPeriodBody.budgets[0].id, createdTransport.budget.id);

    // 7. Get by id
    const detailRes = await fetch(`${srv.baseUrl}/budgets/${createdFood.budget.id}`);
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as { budget: BudgetRecord };
    assert.equal(detailBody.budget.id, createdFood.budget.id);

    // 8. Duplicate category + period returns 409 Conflict
    const duplicateRes = await fetch(`${srv.baseUrl}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'alimentación',
        limitAmount: 900,
        period: '2026-11',
      }),
    });
    assert.equal(duplicateRes.status, 409);

    // 9. Missing budget returns 404
    const missingRes = await fetch(`${srv.baseUrl}/budgets/non-existent-id`);
    assert.equal(missingRes.status, 404);
  });

  it('validates input fields, query filters, and malformed JSON', async () => {
    const srv = await startTestServer();
    cleanups.push(srv.close);

    const invalidPayloads = [
      { category: '   ', limitAmount: 500, period: '2026-11' },
      { limitAmount: 500, period: '2026-11' },
      { category: 'Comida', limitAmount: 0, period: '2026-11' },
      { category: 'Comida', limitAmount: -100, period: '2026-11' },
      { category: 'Comida', limitAmount: '500', period: '2026-11' },
      { category: 'Comida', limitAmount: 500, period: '' },
      { category: 'Comida', limitAmount: 500, period: '2026-13' },
      { category: 'Comida', limitAmount: 500, period: '2026-00' },
      { category: 'Comida', limitAmount: 500, period: 'daily' },
      { category: 'Comida', limitAmount: 500, period: '2026-11', currency: 'SOLES' },
    ];

    for (const payload of invalidPayloads) {
      const res = await fetch(`${srv.baseUrl}/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400);
    }

    const badPeriodFilterRes = await fetch(`${srv.baseUrl}/budgets?period=invalid-period`);
    assert.equal(badPeriodFilterRes.status, 400);

    const emptyCategoryFilterRes = await fetch(`${srv.baseUrl}/budgets?category=`);
    assert.equal(emptyCategoryFilterRes.status, 400);

    const badJsonRes = await fetch(`${srv.baseUrl}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    assert.equal(badJsonRes.status, 400);
  });
});
