import { create } from "zustand";
import { cloudMe } from "./cloud";

/** Free tier (desktop): tokens per day. Pro tiers raise/remove this. */
export const FREE_DAILY_TOKENS = 2000;

type Plan = "free" | "pro" | "byok"; // byok = bring-your-own-key (uncapped)

export interface CloudQuota {
  signedIn: boolean;
  email: string | null;
  plan: "free" | "pro" | "org";
  window: "day" | "month";
  actions: number;
  remaining: number;
}

interface UsageState {
  plan: Plan;
  day: string; // YYYY-MM-DD the counter applies to
  used: number; // tokens used today (desktop)
  /** Web editor account state; null until synced or when anonymous/offline. */
  cloud: CloudQuota | null;

  /** Units left: tokens (desktop free) or actions (web). Infinity when uncapped. */
  remaining: () => number;
  /** Whether an AI action is currently allowed. */
  canUse: () => boolean;
  /** Record one successful AI call (tokens on desktop; one action on web). */
  record: (tokens: number) => void;
  /** Roll the counter to today if the date changed. */
  rollDay: () => void;
  setPlan: (plan: Plan) => void;
  reset: () => void;
  /** Web only: refresh plan + quota from the account API. */
  syncCloud: () => Promise<void>;
}

function today(): string {
  // Local date (not UTC) so the reset matches the user's midnight.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STORAGE_KEY = "harfsaz.usage.v1";

function load(): { plan: Plan; day: string; used: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { plan: v.plan ?? "free", day: v.day ?? today(), used: v.used ?? 0 };
    }
  } catch {
    /* ignore */
  }
  return { plan: "free", day: today(), used: 0 };
}

function save(s: { plan: Plan; day: string; used: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan: s.plan, day: s.day, used: s.used }));
  } catch {
    /* ignore */
  }
}

const initial = load();

export const useUsage = create<UsageState>((set, get) => ({
  plan: initial.plan,
  day: initial.day,
  used: initial.used,
  cloud: null,

  remaining: () => {
    const s = get();
    return s.cloud?.signedIn ? Math.max(0, s.cloud.remaining) : 0;
  },

  canUse: () => get().remaining() > 0,

  record: (_tokens) => {
    set(s => s.cloud ? {cloud:{...s.cloud,remaining:Math.max(0,s.cloud.remaining-1)}} : s);
    void get().syncCloud();
  },

  rollDay: () =>
    set((s) => {
      const d = today();
      if (s.day === d) return s;
      const next = { plan: s.plan, day: d, used: 0 };
      save(next);
      return next;
    }),

  setPlan: (plan) =>
    set((s) => {
      const next = { plan, day: s.day, used: s.used };
      save(next);
      return next;
    }),

  reset: () =>
    set((s) => {
      const next = { plan: s.plan, day: today(), used: 0 };
      save(next);
      return next;
    }),

  syncCloud: async () => {
    const me = await cloudMe();
    if (!me) {
      set({ cloud: { signedIn: false, email: null, plan: "free", window: "day", actions: 0, remaining: 0 }, plan: "free" });
      return;
    }
    set({
      cloud: {
        signedIn: true,
        email: me.user.email,
        plan: me.plan,
        window: me.quota.window,
        actions: me.quota.actions,
        remaining: me.quota.remaining,
      },
      // The web meter is per-account; "pro" here only affects labels.
      plan: me.plan === "free" ? "free" : "pro",
    });
  },
}));
