import { useMemo, useState } from 'react';
import { Plus, Receipt, Search } from 'lucide-react';
import type { Transaction } from '../types';

interface TransactionsListProps {
  transactions: Transaction[];
  isLoading?: boolean;
  onNewTransaction: () => void;
}

export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === 'PEN' ? 'S/' : '$';
  const formatted = amount.toLocaleString('es-CO', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted} ${currency}`;
}

/** Displays the transactions table with search, category filter, and create action. */
export function TransactionsList({
  transactions,
  isLoading = false,
  onNewTransaction,
}: TransactionsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = useMemo(() => {
    const unique = new Set(transactions.map((tx) => tx.category));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (selectedCategory !== 'all' && tx.category !== selectedCategory) {
        return false;
      }
      if (!term) return true;
      return (
        tx.description.toLowerCase().includes(term) ||
        tx.category.toLowerCase().includes(term) ||
        tx.date.includes(term)
      );
    });
  }, [transactions, searchTerm, selectedCategory]);

  return (
    <section
      className="card transactions-card"
      aria-labelledby="transactions-heading"
    >
      <div className="transactions-header">
        <div>
          <h2 id="transactions-heading" className="section-title">
            Listado de transacciones
          </h2>
          <p className="section-subtitle">
            {transactions.length === 0
              ? '0 movimientos registrados'
              : `${filteredTransactions.length} de ${transactions.length} movimiento(s) registrados`}
          </p>
        </div>

        <div className="transactions-actions">
          <select
            className="select-control select-sm"
            aria-label="Filtrar por categoría"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={transactions.length === 0}
          >
            <option value="all">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="search-box">
            <Search size={16} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar transacción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={transactions.length === 0}
              aria-label="Buscar transacción"
            />
          </div>

          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={onNewTransaction}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Nueva transacción</span>
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="transactions-table">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Descripción</th>
              <th scope="col">Categoría</th>
              <th scope="col" className="align-right">
                Monto
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((tx) => (
              <tr key={tx.id}>
                <td>{tx.date}</td>
                <td>{tx.description || `Movimiento en ${tx.category}`}</td>
                <td>
                  <span className="category-badge">{tx.category}</span>
                </td>
                <td
                  className={`align-right tabular ${
                    tx.type === 'expense' ? 'text-expense' : 'text-income'
                  }`}
                >
                  {tx.type === 'expense' ? '-' : '+'}
                  {formatMoney(tx.amount, tx.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && transactions.length === 0 && (
          <div className="empty-state" role="status">
            <div className="empty-icon" aria-hidden="true">
              <Receipt size={28} strokeWidth={1.75} />
            </div>
            <h3 className="empty-title">Aún no tienes transacciones</h3>
            <p className="empty-description">
              Cuando registres tus primeros ingresos o gastos en Centavo,
              aparecerán listados aquí para que puedas categorizarlos y seguir tus
              presupuestos.
            </p>
          </div>
        )}

        {!isLoading &&
          transactions.length > 0 &&
          filteredTransactions.length === 0 && (
            <div className="empty-state" role="status">
              <p className="empty-description">
                No hay transacciones que coincidan con el filtro aplicado.
              </p>
            </div>
          )}

        {isLoading && (
          <div className="empty-state" role="status">
            <p className="empty-description">Cargando transacciones...</p>
          </div>
        )}
      </div>
    </section>
  );
}
