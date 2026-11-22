import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Login and registration screen connected to auth-service via AuthContext. */
export function LoginPage() {
  const { login, register, loginDemo } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usedDemoFill, setUsedDemoFill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        await register({ name, email, password });
      } else if (usedDemoFill) {
        await loginDemo({ email, password });
      } else {
        await login({ email, password });
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión. Intenta nuevamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoFill = () => {
    setMode('login');
    setEmail('demo@centavo.app');
    setPassword('centavo123');
    setUsedDemoFill(true);
    setError(null);
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setUsedDemoFill(false);
    setError(null);
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark brand-mark-lg" aria-hidden="true">
            <Wallet size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="login-title">Centavo</h1>
            <p className="login-subtitle">
              {mode === 'login'
                ? 'Inicia sesión para gestionar tus gastos y presupuestos'
                : 'Crea tu cuenta para comenzar a registrar tus gastos'}
            </p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}

          {mode === 'register' && (
            <div className="field">
              <label htmlFor="name">Nombre completo</label>
              <div className="input-wrapper">
                <UserIcon size={16} className="input-icon" aria-hidden="true" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <div className="input-wrapper">
              <Mail size={16} className="input-icon" aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setUsedDemoFill(false);
                }}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="input-wrapper">
              <Lock size={16} className="input-icon" aria-hidden="true" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setUsedDemoFill(false);
                }}
                required
              />
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? mode === 'login'
                ? 'Ingresando...'
                : 'Creando cuenta...'
              : mode === 'login'
                ? 'Iniciar sesión'
                : 'Crear cuenta'}
          </button>
        </form>

        <div className="login-footer">
          <button type="button" className="btn-link" onClick={toggleMode}>
            {mode === 'login'
              ? '¿No tienes cuenta? Crear cuenta'
              : '¿Ya tienes cuenta? Iniciar sesión'}
          </button>

          <button
            type="button"
            className="btn-link"
            onClick={handleDemoFill}
          >
            Completar con datos de demostración
          </button>

          <span className="scaffold-note">
            Conectado a <code>auth-service</code>
          </span>
        </div>
      </div>
    </div>
  );
}
