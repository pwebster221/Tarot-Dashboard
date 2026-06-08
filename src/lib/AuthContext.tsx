import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface AuthUser {
  sub: string;
  email: string;
  name: string;
  onboarded?: boolean;
  lens?: "archetypal" | "mystical";
  displayName?: string | null;
}
interface AuthContextType {
  currentUser: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ currentUser: null, loading: true, refresh: async () => {} });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      setCurrentUser(r.ok ? await r.json() : null);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ currentUser, loading, refresh }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
