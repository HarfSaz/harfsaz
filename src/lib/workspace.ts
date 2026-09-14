import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { CloudMe } from "./cloud";
export interface RecentDocument { path: string; name: string; openedAt: number; pages: number; language: string }
interface WorkspaceState {
  view: "workspace" | "editor";
  section: "documents" | "billing";
  setSection: (section: "documents" | "billing") => void;
  profile: CloudMe | null;
  offline: boolean;
  recents: RecentDocument[];
  setView: (view: "workspace" | "editor") => void;
  setAccount: (profile: CloudMe | null, offline?: boolean) => void;
  remember: (entry: RecentDocument) => void;
  forget: (path: string) => void;
}
export function mergeRecentDocuments(entries: RecentDocument[], entry: RecentDocument): RecentDocument[] {
  return [entry, ...entries.filter(item => item.path !== entry.path)].sort((a,b) => b.openedAt-a.openedAt).slice(0,24);
}
function readRecents(id: string): RecentDocument[] {
  try { const entries=JSON.parse(localStorage.getItem(`harfsaz.recents.${id}`) ?? "[]");
    return Array.isArray(entries) ? entries.filter(item => item && typeof item.path === "string" && typeof item.name === "string" && Number.isFinite(item.openedAt) && typeof item.language === "string" && Number.isInteger(item.pages) && item.pages > 0).slice(0,24) : [];
  } catch {return [];}
}
function persist(id: string | undefined, recents: RecentDocument[]) {if(id) try {localStorage.setItem(`harfsaz.recents.${id}`,JSON.stringify(recents));}catch{ /* Recent history must not prevent saving a document. */ }}
export const useWorkspace=create<WorkspaceState>((set,get)=>({
  section:typeof window !== "undefined" && new URLSearchParams(window.location.search).get("section") === "billing" ? "billing" : "documents",setSection:section=>set({section,view:"workspace"}),
  view:"workspace",profile:null,offline:false,recents:[],
  setView:view=>set({view}),
  setAccount:(profile,offline=false)=>set({profile,offline,recents:profile?readRecents(profile.user.id):[],view:"workspace"}),
  remember:entry=>{const recents=mergeRecentDocuments(get().recents,entry);persist(get().profile?.user.id,recents);set({recents});},
  forget:path=>{const recents=get().recents.filter(entry=>entry.path!==path);persist(get().profile?.user.id,recents);set({recents});},
}));
export interface DesktopAccountResult {status:"signed_in"|"signed_out"|"pending"|"expired";profile?:CloudMe;offline?:boolean;code?:string;url?:string;opened?:boolean}
export const desktopAccount=(action:string)=>invoke<DesktopAccountResult>("desktop_account",{action});
