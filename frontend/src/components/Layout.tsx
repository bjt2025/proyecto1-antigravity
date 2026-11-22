import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  Bell,
  FileBarChart2,
  LogOut,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { id: 'transactions', label: 'Transacciones', icon: ArrowLeftRight, active: true, badge: null },
  { id: 'budgets', label: 'Presupuestos', icon: PiggyBank, active: false, badge: 'Pronto' },
  { id: 'notifications', label: 'Alertas', icon: Bell, active: false, badge: 'Pronto' },
  { id: 'reports', label: 'Reportes', icon: FileBarChart2, active: false, badge: 'Pronto' },
];

/** Main dashboard shell with sidebar navigation, top header, and logout action. */
export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Wallet size={20} strokeWidth={2.2} />
          </div>
          <div>
            <span className="brand-name">Centavo</span>
            <span className="brand-subtitle">Finanzas personales</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${item.active ? 'is-active' : 'is-disabled'}`}
                disabled={!item.active}
                aria-current={item.active ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="user-avatar" aria-hidden="true">
              {(user?.name?.[0] ?? 'C').toUpperCase()}
            </div>
            <div className="user-meta">
              <span className="user-name">{user?.name ?? 'Usuario'}</span>
              <span className="user-email">{user?.email ?? ''}</span>
            </div>
          </div>

          <button type="button" className="btn-logout" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <div>
            <h1 className="page-title">Panel principal</h1>
            <p className="page-subtitle">
              Resumen de movimientos y control de tus gastos personales
            </p>
          </div>
          <div className="topbar-status">
            <span className="status-dot" aria-hidden="true" />
            <span>Sesión activa</span>
          </div>
        </header>

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
