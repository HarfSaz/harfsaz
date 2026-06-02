// Daily AI usage meter (free-tier paywall).
//
// Tracks tokens consumed per day, resets at local midnight, and gates AI when
// the free daily cap is hit. Persisted to localStorage so it survives restarts.
//
// IMPORTANT (honest security note): this is CLIENT-SIDE enforcement — fine for an
// honest freemium UX, but a determined user can bypass it. True enforcement
// belongs on a server that holds the key and counts tokens per account. This
// store is structured so that when you launch billing, `record`/`canUse` can be
// backed by a server call with minimal changes.
import { create } from "zustand";

/** Free tier: tokens per day. Pro tiers raise/remove this. */
export const FREE_DAILY_TOKENS = 2000;

type Plan = "free" | "pro" | "byok"; // byok = bring-your-own-key (uncapped)

interface UsageState {
  plan: Plan;
  day: string; // YYYY-MM-DD the counter applies to
  used: number; // tokens used today

  /** Tokens left today (Infinity for non-free plans). */
  remaining: () => number;
  /** Whether an AI action is currently allowed. */
  canUse: () => boolean;
  /** Record consumed tokens after a successful AI call. */
  record: (tokens: number) => void;
  /** Roll the counter to today if the date changed. */
  rollDay: () => void;
  setPlan: (plan: Plan) => void;
  reset: () => void;
}

function today(): string {
  // Local date (not UTC) so the reset matches the user's midnight.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STORAGE_KEY = "qalam.usage.v1";

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

  remaining: () => {
    const s = get();
    if (s.plan !== "free") return Infinity;
    const used = s.day === today() ? s.used : 0;
    return Math.max(0, FREE_DAILY_TOKENS - used);
  },

  canUse: () => get().remaining() > 0,

  record: (tokens) =>
    set((s) => {
      const d = today();
      const used = (s.day === d ? s.used : 0) + Math.max(0, Math.round(tokens));
      const next = { plan: s.plan, day: d, used };
      save(next);
      return next;
    }),

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
}));
