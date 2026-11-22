import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { CreateTransactionInput, TransactionType } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTransactionInput) => Promise<void>;
}

const DEFAULT_CATEGORIES = [
  'Comida',
  'Transporte',
  'Vivienda',
  'Servicios',
  'Salud',
  'Entretenimiento',
  'Salario',
  'Otros',
];

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Modal form to register a new expense or income in transactions-service. */
export function TransactionModal({
  isOpen,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [category, setCategory] = useState('Comida');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => getTodayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido mayor que 0.');
      return;
    }

    if (!category.trim()) {
      setError('Selecciona o ingresa una categoría.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        type,
        amount: parsedAmount,
        currency,
        category: category.trim(),
        description: description.trim(),
        date,
      });
      setAmount('');
      setDescription('');
      setCategory('Comida');
      setType('expense');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar la transacción.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="transaction-modal-title" className="modal-title">
              Nueva transacción
            </h2>
            <p className="modal-subtitle">
              Registra un gasto o ingreso y asígnale una categoría
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

          <div className="form-row">
            <div className="field">
              <label htmlFor="tx-type">Tipo</label>
              <select
                id="tx-type"
                name="type"
                className="select-control"
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="tx-currency">Moneda</label>
              <select
                id="tx-currency"
                name="currency"
                className="select-control"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="COP">COP ($)</option>
                <option value="USD">USD ($)</option>
                <option value="PEN">PEN (S/)</option>
                <option value="MXN">MXN ($)</option>
                <option value="CLP">CLP ($)</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="tx-amount">Monto</label>
              <div className="input-wrapper">
                <input
                  id="tx-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="any"
                  placeholder="50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="tx-category">Categoría</label>
              <select
                id="tx-category"
                name="category"
                className="select-control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                {DEFAULT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="tx-date">Fecha</label>
            <div className="input-wrapper">
              <input
                id="tx-date"
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="tx-description">Descripción (opcional)</label>
            <div className="input-wrapper">
              <input
                id="tx-description"
                name="description"
                type="text"
                maxLength={200}
                placeholder="Ej. Almuerzo o mercado"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar transacción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
