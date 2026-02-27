import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

interface User {
  _id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('accessToken')
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const res = await api.get('/users/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setUser(res.data);
          setAccessToken(token);
        } catch {
          localStorage.removeItem('accessToken');
          setAccessToken(null);
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { accessToken: token } = res.data;
    localStorage.setItem('accessToken', token);
    setAccessToken(token);
    const meRes = await api.get('/users/me', { headers: { Authorization: `Bearer ${token}` } });
    setUser(meRes.data);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { name, email, password });
    const { accessToken: token } = res.data;
    localStorage.setItem('accessToken', token);
    setAccessToken(token);
    const meRes = await api.get('/users/me', { headers: { Authorization: `Bearer ${token}` } });
    setUser(meRes.data);
  };

  const logout = async () => {
    if (accessToken) {
      try {
        await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch { /* best-effort logout */ }
    }
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
