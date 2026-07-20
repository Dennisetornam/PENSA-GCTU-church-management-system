import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, ShieldCheck } from "lucide-react";
import { api, invalidateFinance } from "./api";
import { Spinner } from "./ui";

interface Ctx { unlocked: boolean; isLoading: boolean; lock: () => void; markUnlocked: () => void }
const FinanceGateContext = createContext<Ctx>({ unlocked: false, isLoading: true, lock: () => {}, markUnlocked: () => {} });

export function FinanceGateProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["finance-gate"],
    queryFn: () => api.get<{ unlocked: boolean }>("/auth/finance/status"),
    refetchOnWindowFocus: true,
  });
  const markUnlocked = () => { qc.setQueryData(["finance-gate"], { unlocked: true }); invalidateFinance(qc); };
  const lock = () => {
    api.post("/auth/finance/logout").catch(() => {});
    qc.setQueryData(["finance-gate"], { unlocked: false });
    invalidateFinance(qc);
  };
  return (
    <FinanceGateContext.Provider value={{ unlocked: !!data?.unlocked, isLoading, lock, markUnlocked }}>
      {children}
    </FinanceGateContext.Provider>
  );
}

export const useFinanceGate = () => useContext(FinanceGateContext);

/** Wrap a finance page: shows the confidential login until the gate is unlocked. */
export function FinanceGate({ children }: { children: ReactNode }) {
  const { unlocked, isLoading, markUnlocked } = useFinanceGate();
  if (isLoading) return <div className="grid h-60 place-items-center text-ink-soft/50"><Spinner /></div>;
  if (!unlocked) return <FinanceLogin onUnlocked={markUnlocked} />;
  return <>{children}</>;
}

function FinanceLogin({ onUnlocked }: { onUnlocked: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.post("/auth/finance/login", { email: email.trim(), password }),
    onSuccess: onUnlocked,
    onError: () => setErr("Those finance credentials are not correct."),
  });
  const submit = () => { setErr(null); if (email.trim() && password) m.mutate(); };

  return (
    <div className="mx-auto max-w-md">
      <div className="card candlelight relative overflow-hidden p-7">
        <div className="candlelight absolute inset-0 opacity-50" />
        <div className="relative">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-vespers text-gold-soft"><Lock size={22} /></div>
          <div className="eyebrow mb-1.5">Confidential</div>
          <h1 className="font-display text-3xl font-semibold text-ink">Finance is locked</h1>
          <p className="mt-2 text-sm text-ink-soft/70">This section requires the finance passphrase. Enter the confidential finance credentials to continue.</p>

          <div className="mt-6 space-y-3">
            <div>
              <label className="label">Finance email</label>
              <input className="field" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="finance sign-in" />
            </div>
            <div>
              <label className="label">Finance password</label>
              <input type="password" className="field" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
            </div>
            {err && <div className="rounded-xl border border-clay/30 bg-clay/8 px-3 py-2 text-sm text-clay">{err}</div>}
            <button className="btn-gold w-full" disabled={!email.trim() || !password || m.isPending} onClick={submit}>
              {m.isPending ? <Spinner /> : <><ShieldCheck size={16} /> Unlock finance</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
