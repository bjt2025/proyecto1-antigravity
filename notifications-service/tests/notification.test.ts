import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createNotificationsApp } from '../src/app.js';
import type { BudgetClient } from '../src/clients/budgetClient.js';
import type { NotificationsConfig } from '../src/config.js';
import { createLogger } from '../src/core/logger.js';
import type {
  BudgetSnapshot,
  ListNotificationsResult,
  NotificationRecord,
  TransactionEvaluationResult,
} from '../src/types/notification.js';

function createTestConfig(overrides: Partial<NotificationsConfig> = {}): NotificationsConfig {
  return {
    port: 0,
    corsOrigin: 'http://localhost:5173',
    budgetsServiceUrl: 'http://127.0.0.1:3999',
    budgetsRequestTimeoutMs: 2000,
    defaultCurrency: 'PEN',
    nodeEnv: 'test',
    ...overrides,
  };
}

async function startStubBudgetsServer(budgets: BudgetSnapshot[]) {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && reqUrl.pathname === '/budgets') {
      const category = reqUrl.searchParams.get('category')?.trim().toLowerCase();
      const filtered = category
        ? budgets.filter((b) => b.category.toLowerCase() === category)
        : budgets;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ budgets: filtered, total: filtered.length }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function startTestServer(options: {
  config?: Partial<NotificationsConfig>;
  budgetClient?: BudgetClient;
  now?: () => number;
} = {}) {
  const capturedLogs: string[] = [];
  const logger = createLogger((_level, serialized) => {
    capturedLogs.push(serialized);
  });

  const context = createNotificationsApp({
    config: createTestConfig(options.config),
    budgetClient: options.budgetClient,
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

describe('notifications-service base structure', () => {
  const cleanups: Array<() => Promise<void>> = [];

  after(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
  });

  it('evaluates cumulative expenses against budgets-service over HTTP and manages generated alerts', async () => {
    let currentTimeMs = Date.parse('2026-11-21T10:00:00.000Z');
    const budgetsServer = await startStubBudgetsServer([
      {
        id: 'budget-food-2026-11',
        category: 'Alimentación',
        limitAmount: 800,
        period: '2026-11',
        currency: 'PEN',
      },
      {
        id: 'budget-food-monthly',
        category: 'Alimentación',
        limitAmount: 1000,
        period: 'monthly',
        currency: 'PEN',
      },
    ]);
    cleanups.push(budgetsServer.close);

    const srv = await startTestServer({
      config: { budgetsServiceUrl: budgetsServer.baseUrl },
      now: () => currentTimeMs,
    });
    cleanups.push(srv.close);

    // 1. Health check
    const healthRes = await fetch(`${srv.baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as { status: string; service: string };
    assert.deepEqual(healthBody, { status: 'ok', service: 'notifications-service' });

    // 2. Empty alerts list initially
    const emptyListRes = await fetch(`${srv.baseUrl}/notifications`);
    assert.equal(emptyListRes.status, 200);
    const emptyList = (await emptyListRes.json()) as ListNotificationsResult;
    assert.deepEqual(emptyList, { alerts: [], total: 0 });

    // 3. First transaction within budget (550 / 800)
    const firstEventRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: 'tx-101',
        amount: 550,
        category: 'alimentación',
        date: '2026-11-10',
        type: 'expense',
      }),
    });
    assert.equal(firstEventRes.status, 200);
    const firstResult = (await firstEventRes.json()) as TransactionEvaluationResult;
    assert.equal(firstResult.alertGenerated, false);
    assert.equal(firstResult.reason, 'WITHIN_BUDGET');
    assert.equal(firstResult.budget?.id, 'budget-food-2026-11');
    assert.equal(firstResult.evaluation?.totalSpent, 550);
    assert.equal(firstResult.evaluation?.exceededBy, 0);
    assert.equal(firstResult.alert, null);

    // 4. Duplicate transactionId is idempotent
    const duplicateRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: 'tx-101',
        amount: 550,
        category: 'alimentación',
        date: '2026-11-10',
      }),
    });
    assert.equal(duplicateRes.status, 200);
    const duplicateResult = (await duplicateRes.json()) as TransactionEvaluationResult;
    assert.equal(duplicateResult.alertGenerated, false);
    assert.equal(duplicateResult.reason, 'ALREADY_PROCESSED');

    // 5. Second transaction pushes cumulative spending over limit (550 + 350 = 900 > 800)
    currentTimeMs += 1000;
    const secondEventRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: 'tx-102',
        amount: 350,
        category: 'Alimentación',
        date: '2026-11-21',
        type: 'expense',
        currency: 'pen',
      }),
    });
    assert.equal(secondEventRes.status, 201);
    const secondResult = (await secondEventRes.json()) as TransactionEvaluationResult;
    assert.equal(secondResult.alertGenerated, true);
    assert.equal(secondResult.reason, 'BUDGET_EXCEEDED');
    assert.equal(secondResult.evaluation?.previousSpent, 550);
    assert.equal(secondResult.evaluation?.totalSpent, 900);
    assert.equal(secondResult.evaluation?.exceededBy, 100);
    assert.ok(secondResult.alert);
    assert.equal(secondResult.alert.status, 'unread');
    assert.equal(secondResult.alert.type, 'overspending');
    assert.equal(secondResult.alert.severity, 'critical');
    assert.equal(secondResult.alert.budgetId, 'budget-food-2026-11');

    const alertId = secondResult.alert.id;

    // 6. List and filter alerts
    const unreadRes = await fetch(
      `${srv.baseUrl}/notifications?status=unread&category=${encodeURIComponent('alimentación')}&period=2026-11`
    );
    assert.equal(unreadRes.status, 200);
    const unreadList = (await unreadRes.json()) as ListNotificationsResult;
    assert.equal(unreadList.total, 1);
    assert.equal(unreadList.alerts[0].id, alertId);

    // 7. Get alert detail and mark as read
    const detailRes = await fetch(`${srv.baseUrl}/notifications/${alertId}`);
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as { alert: NotificationRecord };
    assert.equal(detailBody.alert.id, alertId);

    currentTimeMs += 1000;
    const readRes = await fetch(`${srv.baseUrl}/notifications/${alertId}/read`, {
      method: 'PATCH',
    });
    assert.equal(readRes.status, 200);
    const readBody = (await readRes.json()) as { alert: NotificationRecord };
    assert.equal(readBody.alert.status, 'read');

    const readFilterRes = await fetch(`${srv.baseUrl}/notifications?status=unread`);
    const readFilterList = (await readFilterRes.json()) as ListNotificationsResult;
    assert.equal(readFilterList.total, 0);

    // 8. Missing alert returns 404
    const missingRes = await fetch(`${srv.baseUrl}/notifications/non-existent-id`);
    assert.equal(missingRes.status, 404);
  });

  it('handles explicit spent totals, income events, missing budgets, currency mismatch, and upstream errors', async () => {
    const budgetClient: BudgetClient = {
      async findByCategory(category: string): Promise<BudgetSnapshot[]> {
        if (category.toLowerCase() === 'transporte') {
          return [
            {
              id: 'budget-transport-weekly',
              category: 'Transporte',
              limitAmount: 150,
              period: 'weekly',
              currency: 'PEN',
            },
          ];
        }
        if (category.toLowerCase() === 'error-upstream') {
          throw new Error('unexpected failure');
        }
        return [];
      },
    };

    const srv = await startTestServer({ budgetClient });
    cleanups.push(srv.close);

    // 1. Income event ignored
    const incomeRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 2000,
        category: 'Transporte',
        date: '2026-11-21',
        type: 'income',
      }),
    });
    assert.equal(incomeRes.status, 200);
    const incomeBody = (await incomeRes.json()) as TransactionEvaluationResult;
    assert.equal(incomeBody.alertGenerated, false);
    assert.equal(incomeBody.reason, 'INCOME_IGNORED');

    // 2. No matching budget
    const noBudgetRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 300,
        category: 'Entretenimiento',
        date: '2026-11-21',
      }),
    });
    assert.equal(noBudgetRes.status, 200);
    const noBudgetBody = (await noBudgetRes.json()) as TransactionEvaluationResult;
    assert.equal(noBudgetBody.alertGenerated, false);
    assert.equal(noBudgetBody.reason, 'NO_MATCHING_BUDGET');

    // 3. Currency mismatch
    const currencyMismatchRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 200,
        category: 'Transporte',
        date: '2026-11-21',
        currency: 'USD',
      }),
    });
    assert.equal(currencyMismatchRes.status, 200);
    const mismatchBody = (await currencyMismatchRes.json()) as TransactionEvaluationResult;
    assert.equal(mismatchBody.alertGenerated, false);
    assert.equal(mismatchBody.reason, 'CURRENCY_MISMATCH');

    // 4. Explicit previousSpent triggers overspending alert
    const explicitPrevRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'tx-201',
        amount: 60,
        category: 'Transporte',
        date: '2026-11-21',
        previousSpent: 120,
      }),
    });
    assert.equal(explicitPrevRes.status, 201);
    const explicitPrevBody = (await explicitPrevRes.json()) as TransactionEvaluationResult;
    assert.equal(explicitPrevBody.alertGenerated, true);
    assert.equal(explicitPrevBody.evaluation?.totalSpent, 180);
    assert.equal(explicitPrevBody.evaluation?.exceededBy, 30);

    // 5. Explicit accumulatedSpent within budget
    const explicitAccRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'tx-202',
        amount: 40,
        category: 'Transporte',
        date: '2026-11-21',
        accumulatedSpent: 150,
      }),
    });
    assert.equal(explicitAccRes.status, 200);
    const explicitAccBody = (await explicitAccRes.json()) as TransactionEvaluationResult;
    assert.equal(explicitAccBody.alertGenerated, false);
    assert.equal(explicitAccBody.reason, 'WITHIN_BUDGET');
    assert.equal(explicitAccBody.evaluation?.previousSpent, 110);

    // 6. Real unreachable budgets-service returns 502 UPSTREAM_ERROR
    const unreachableSrv = await startTestServer({
      config: { budgetsServiceUrl: 'http://127.0.0.1:1', budgetsRequestTimeoutMs: 500 },
    });
    cleanups.push(unreachableSrv.close);

    const upstreamFailRes = await fetch(
      `${unreachableSrv.baseUrl}/notifications/events/transaction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 100,
          category: 'Transporte',
          date: '2026-11-21',
        }),
      }
    );
    assert.equal(upstreamFailRes.status, 502);
    const upstreamFailBody = (await upstreamFailRes.json()) as { code: string };
    assert.equal(upstreamFailBody.code, 'UPSTREAM_ERROR');
  });

  it('validates event payloads, query filters, and malformed JSON', async () => {
    const srv = await startTestServer();
    cleanups.push(srv.close);

    const invalidPayloads = [
      { amount: 0, category: 'Comida', date: '2026-11-21' },
      { amount: -50, category: 'Comida', date: '2026-11-21' },
      { amount: '50', category: 'Comida', date: '2026-11-21' },
      { amount: 50, category: '   ', date: '2026-11-21' },
      { amount: 50, date: '2026-11-21' },
      { amount: 50, category: 'Comida', date: '' },
      { amount: 50, category: 'Comida', date: '2026-02-30' },
      { amount: 50, category: 'Comida', date: '2026-11-21', type: 'transfer' },
      { amount: 50, category: 'Comida', date: '2026-11-21', currency: 'SOLES' },
      { amount: 50, category: 'Comida', date: '2026-11-21', transactionId: '   ' },
      { amount: 50, category: 'Comida', date: '2026-11-21', previousSpent: -1 },
      { amount: 50, category: 'Comida', date: '2026-11-21', accumulatedSpent: 40 },
      {
        amount: 50,
        category: 'Comida',
        date: '2026-11-21',
        previousSpent: 10,
        accumulatedSpent: 60,
      },
    ];

    for (const payload of invalidPayloads) {
      const res = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400);
    }

    const badStatusFilter = await fetch(`${srv.baseUrl}/notifications?status=archived`);
    assert.equal(badStatusFilter.status, 400);

    const badPeriodFilter = await fetch(`${srv.baseUrl}/notifications?period=daily`);
    assert.equal(badPeriodFilter.status, 400);

    const emptyCategoryFilter = await fetch(`${srv.baseUrl}/notifications?category=`);
    assert.equal(emptyCategoryFilter.status, 400);

    const badJsonRes = await fetch(`${srv.baseUrl}/notifications/events/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    assert.equal(badJsonRes.status, 400);
  });
});
