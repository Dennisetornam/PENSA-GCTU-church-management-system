import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface Me {
  userId: string;
  role: string;
  scope: { departments: string[]; cells: string[] };
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  church_admin: "Church Administrator",
  department_leader: "Department Leader",
  cell_leader: "Cell Leader",
};
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    await api.post("/auth/login", { email, password });
    setMe(await api.get<Me>("/auth/me"));
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setMe(null);
    }
  };

  return <Ctx.Provider value={{ me, loading, login, logout }}>{children}</Ctx.Provider>;
}
