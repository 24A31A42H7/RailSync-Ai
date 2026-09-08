import { createContext, useContext, useState, useCallback } from "react";
import client from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [manager, setManager] = useState(() => {
    const raw = localStorage.getItem("rsai_manager");
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (username, password) => {
    const { data } = await client.post("/api/auth/login", { username, password });
    localStorage.setItem("rsai_token", data.access_token);
    const mgr = { username: data.username, full_name: data.full_name };
    localStorage.setItem("rsai_manager", JSON.stringify(mgr));
    setManager(mgr);
    return mgr;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("rsai_token");
    localStorage.removeItem("rsai_manager");
    setManager(null);
  }, []);

  return (
    <AuthContext.Provider value={{ manager, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
