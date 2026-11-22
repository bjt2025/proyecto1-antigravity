import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getStoredUser,
  loginWithCredentials,
  loginWithDemoCredentials,
  logoutSession,
  registerWithCredentials,
  verifyStoredSession,
} from '../services/auth';
import type { LoginCredentials, RegisterCredentials, User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  loginDemo: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Provides central authentication state connected to auth-service across dashboard routes. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());

  useEffect(() => {
    let active = true;
    if (!getStoredUser()) return;

    verifyStoredSession().then((verifiedUser) => {
      if (active) {
        setUser(verifiedUser);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const authenticatedUser = await loginWithCredentials(credentials);
    setUser(authenticatedUser);
  };

  const register = async (credentials: RegisterCredentials) => {
    const registeredUser = await registerWithCredentials(credentials);
    setUser(registeredUser);
  };

  const loginDemo = async (credentials: LoginCredentials) => {
    const authenticatedUser = await loginWithDemoCredentials(credentials);
    setUser(authenticatedUser);
  };

  const logout = () => {
    void logoutSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        login,
        register,
        loginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to consume the central AuthContext. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider.');
  }
  return context;
}
