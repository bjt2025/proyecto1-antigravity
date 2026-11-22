import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createTransactionsApp } from '../src/app.js';
import type { TransactionsConfig } from '../src/config.js';
import { createLogger } from '../src/core/logger.js';
import type { TransactionRecord } from '../src/types/transaction.js';

function createTestConfig(overrides: Partial<TransactionsConfig> = {}): TransactionsConfig {
  return {
    port: 0,
    corsOrigin: 'http://localhost:5173',
    defaultCurrency: 'PEN',
    nodeEnv: 'test',
    ...overrides,
  };
}

async function startTestServer(options: {
  config?: Partial<TransactionsConfig>;
  now?: () => number;
} = {}) {
  const capturedLogs: string[] = [];
  const logger = createLogger((_level, serialized) => {
    capturedLogs.push(serialized);
  });

  const context = createTransactionsApp({
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

describe('transactions-service base structure', () => {
  const cleanups: Array<() => Promise<void>> = [];

  after(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
  });

  it('supports health check, creation, listing, filtering, detail, and recategorization', async () => {
    let currentTimeMs = Date.parse('2026-11-21T10:00:00.000Z');
    const srv = await startTestServer({ now: () => currentTimeMs });
    cleanups.push(srv.close);

    // 1. Health check
    const healthRes = await fetch(`${srv.baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as { status: string; service: string };
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.service, 'transactions-service');

    // 2. Empty list initially
    const emptyListRes = await fetch(`${srv.baseUrl}/transactions`);
    assert.equal(emptyListRes.status, 200);
    const emptyListBody = (await emptyListRes.json()) as {
      transactions: TransactionRecord[];
      total: number;
    };
    assert.deepEqual(emptyListBody, { transactions: [], total: 0 });

    // 3. Create expense with required fields (amount, category, date)
    const createExpenseRes = await fetch(`${srv.baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 42.5,
        category: 'Alimentación',
        date: '2026-11-20',
      }),
    });
    assert.equal(createExpenseRes.status, 201);
    const createdExpense = (await createExpenseRes.json()) as { transaction: TransactionRecord };
    assert.equal(createdExpense.transaction.amount, 42.5);
    assert.equal(createdExpense.transaction.category, 'Alimentación');
    assert.equal(createdExpense.transaction.date, '2026-11-20');
    assert.equal(createdExpense.transaction.description, '');
    assert.equal(createdExpense.transaction.type, 'expense');
    assert.equal(createdExpense.transaction.currency, 'PEN');
    assert.ok(createdExpense.transaction.id);

    // 4. Create second expense on newer date and an income transaction
    currentTimeMs += 1000;
    const createTransportRes = await fetch(`${srv.baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 15,
        category: 'Transporte',
        date: '2026-11-21T14:30:00.000Z',
        description: 'Taxi al centro',
      }),
    });
    assert.equal(createTransportRes.status, 201);
    const createdTransport = (await createTransportRes.json()) as {
      transaction: TransactionRecord;
    };
    assert.equal(createdTransport.transaction.date, '2026-11-21');
    assert.equal(createdTransport.transaction.description, 'Taxi al centro');

    currentTimeMs += 1000;
    const createIncomeRes = await fetch(`${srv.baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1200,
        category: 'Salario',
        date: '2026-11-15',
        description: 'Pago quincenal',
        type: 'income',
        currency: 'usd',
      }),
    });
    assert.equal(createIncomeRes.status, 201);
    const createdIncome = (await createIncomeRes.json()) as { transaction: TransactionRecord };
    assert.equal(createdIncome.transaction.type, 'income');
    assert.equal(createdIncome.transaction.currency, 'USD');

    // 5. List all transactions ordered by date descending
    const listAllRes = await fetch(`${srv.baseUrl}/transactions`);
    assert.equal(listAllRes.status, 200);
    const listAllBody = (await listAllRes.json()) as {
      transactions: TransactionRecord[];
      total: number;
    };
    assert.equal(listAllBody.total, 3);
    assert.deepEqual(
      listAllBody.transactions.map((tx) => tx.id),
      [
        createdTransport.transaction.id,
        createdExpense.transaction.id,
        createdIncome.transaction.id,
      ]
    );

    // 6. Filter by category (case-insensitive) and date range
    const filteredCatRes = await fetch(
      `${srv.baseUrl}/transactions?category=${encodeURIComponent('alimentación')}`
    );
    assert.equal(filteredCatRes.status, 200);
    const filteredCatBody = (await filteredCatRes.json()) as {
      transactions: TransactionRecord[];
      total: number;
    };
    assert.equal(filteredCatBody.total, 1);
    assert.equal(filteredCatBody.transactions[0].id, createdExpense.transaction.id);

    const filteredRangeRes = await fetch(
      `${srv.baseUrl}/transactions?type=expense&from=2026-11-21&to=2026-11-21`
    );
    assert.equal(filteredRangeRes.status, 200);
    const filteredRangeBody = (await filteredRangeRes.json()) as {
      transactions: TransactionRecord[];
      total: number;
    };
    assert.equal(filteredRangeBody.total, 1);
    assert.equal(filteredRangeBody.transactions[0].id, createdTransport.transaction.id);

    // 7. Get by id and recategorize with PATCH
    const detailRes = await fetch(
      `${srv.baseUrl}/transactions/${createdExpense.transaction.id}`
    );
    assert.equal(detailRes.status, 200);

    currentTimeMs += 5000;
    const patchRes = await fetch(
      `${srv.baseUrl}/transactions/${createdExpense.transaction.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'Supermercado',
          description: 'Compras semanales',
        }),
      }
    );
    assert.equal(patchRes.status, 200);
    const patchedBody = (await patchRes.json()) as { transaction: TransactionRecord };
    assert.equal(patchedBody.transaction.category, 'Supermercado');
    assert.equal(patchedBody.transaction.description, 'Compras semanales');
    assert.notEqual(patchedBody.transaction.updatedAt, createdExpense.transaction.updatedAt);

    // 8. Missing transaction returns 404
    const missingRes = await fetch(`${srv.baseUrl}/transactions/non-existent-id`);
    assert.equal(missingRes.status, 404);
  });

  it('validates input fields, filters, and malformed JSON', async () => {
    const srv = await startTestServer();
    cleanups.push(srv.close);

    const invalidPayloads = [
      { amount: 0, category: 'Comida', date: '2026-11-21' },
      { amount: -10, category: 'Comida', date: '2026-11-21' },
      { amount: '25', category: 'Comida', date: '2026-11-21' },
      { amount: 25, category: '   ', date: '2026-11-21' },
      { amount: 25, category: 'Comida', date: '2026-02-30' },
      { amount: 25, category: 'Comida', date: 'not-a-date' },
      { amount: 25, category: 'Comida', date: '2026-11-21', type: 'transfer' },
      { amount: 25, category: 'Comida', date: '2026-11-21', currency: 'SOLES' },
    ];

    for (const payload of invalidPayloads) {
      const res = await fetch(`${srv.baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400);
    }

    const badRangeRes = await fetch(
      `${srv.baseUrl}/transactions?from=2026-11-25&to=2026-11-20`
    );
    assert.equal(badRangeRes.status, 400);

    const badJsonRes = await fetch(`${srv.baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    assert.equal(badJsonRes.status, 400);
  });
});
