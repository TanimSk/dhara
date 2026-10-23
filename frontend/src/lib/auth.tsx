import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, getOrgId, post, refreshAccess, setAccessToken, setOrgId } from "./api";
import type { Me, Membership } from "./types";

interface AuthState {
  ready: boolean;
  me: Me | null;
  membership: Membership | null; // current organization
  signIn: (access: string) => Promise<Me>;
  signOut: () => Promise<void>;
  reload: () => Promise<Me | null>;
  switchOrg: (orgId: number) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [orgId, setOrg] = useState<string | null>(getOrgId());
  const qc = useQueryClient();

  const reload = useCallback(async () => {
    try {
      const data = await api<Me & { success: boolean }>("/auth/me", { org: false });
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshAccess().then(async (ok) => {
      if (ok) await reload();
      setReady(true);
    });
  }, [reload]);

  const membership = useMemo(() => {
    if (!me || me.memberships.length === 0) return null;
    return me.memberships.find((m) => String(m.organization.id) === orgId) ?? me.memberships[0];
  }, [me, orgId]);

  useEffect(() => {
    if (membership && String(membership.organization.id) !== orgId) {
      setOrgId(membership.organization.id);
      setOrg(String(membership.organization.id));
    }
  }, [membership, orgId]);

  const value: AuthState = {
    ready,
    me,
    membership,
    reload,
    signIn: async (access) => {
      setAccessToken(access);
      const data = await reload();
      if (!data) throw new Error("Couldn't load your account");
      return data;
    },
    signOut: async () => {
      await post("/auth/logout").catch(() => {});
      setAccessToken(null);
      setMe(null);
      qc.clear();
    },
    switchOrg: (id) => {
      setOrgId(id);
      setOrg(String(id));
      qc.clear();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function useRole() {
  const { membership } = useAuth();
  const role = membership?.role;
  return {
    role,
    isOwner: role === "owner",
    isManager: role === "owner" || role === "admin",
  };
}
