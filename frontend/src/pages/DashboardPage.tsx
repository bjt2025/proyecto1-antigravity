import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { TransactionModal } from '../components/TransactionModal';
import { formatMoney, TransactionsList } from '../components/TransactionsList';
import {
  createTransaction,
  fetchTransactions,
} from '../services/transactions';
import type { CreateTransactionInput, Transaction } from '../types';

/** Main dashboard view featuring live KPIs and transactions connected to transactions-service. */
export function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const items = await fetchTransactions();
      setTransactions(items);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar las transacciones.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const handleCreateTransaction = async (input: CreateTransactionInput) => {
    const created = await createTransaction(input);
    setTransactions((prev) => [created, ...prev]);
  };

  const summary = useMemo(() => {
    const primaryCurrency = transactions[0]?.currency ?? 'PEN';
    let totalExpenses = 0;
    let totalIncome = 0;
    let expenseCount = 0;

    for (const tx of transactions) {
      if (tx.type === 'expense') {
        totalExpenses += tx.amount;
        expenseCount += 1;
      } else {
        totalIncome += tx.amount;
      }
    }

    return {
      primaryCurrency,
      balance: totalIncome - totalExpenses,
      totalExpenses,
      expenseCount,
    };
  }, [transactions]);

  return (
    <Layout>
      {loadError && (
        <div className="form-alert" role="alert">
          {loadError}
        </div>
      )}

      <section className="kpi-grid" aria-label="Resumen financiero">
        <article className="card kpi-card">
          <span className="kpi-label">Balance del mes</span>
          <strong className="kpi-value tabular">
            {transactions.length === 0
              ? 'S/ 0.00'
              : `${summary.balance < 0 ? '-' : ''}${formatMoney(
                  Math.abs(summary.balance),
                  summary.primaryCurrency
                )}`}
          </strong>
          <span className="kpi-hint">
            {transactions.length === 0
              ? 'Sin movimientos registrados'
              : `${transactions.length} movimiento(s) registrado(s)`}
          </span>
        </article>

        <article className="card kpi-card">
          <span className="kpi-label">Gastos totales</span>
          <strong className="kpi-value tabular">
            {summary.expenseCount === 0
              ? 'S/ 0.00'
              : formatMoney(summary.totalExpenses, summary.primaryCurrency)}
          </strong>
          <span className="kpi-hint">
            {summary.expenseCount === 0
              ? 'Periodo actual'
              : `${summary.expenseCount} gasto(s) en el periodo`}
          </span>
        </article>

        <article className="card kpi-card">
          <span className="kpi-label">Presupuesto configurado</span>
          <strong className="kpi-value tabular">S/ 0.00</strong>
          <span className="kpi-hint">Pendiente de definir</span>
        </article>
      </section>

      <TransactionsList
        transactions={transactions}
        isLoading={isLoading}
        onNewTransaction={() => setIsModalOpen(true)}
      />

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateTransaction}
      />
    </Layout>
  );
}
