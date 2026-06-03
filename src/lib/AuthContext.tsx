import React, { createContext, useContext, useEffect, useState } from "react";

interface AuthUser { sub: string; email: string; name: string; }
interface AuthContextType { currentUser: AuthUser | null; loading: boolean; }

const AuthContext = createContext<AuthContextType>({ currentUser: null, loading: true });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUser(u))
      .catch(() => setCurrentUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
