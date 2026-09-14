import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { siteUrl } from "../lib/cloud";
import type { OnlineDocument } from "../lib/webDocuments";
export function ShareDocumentDialog({document,onClose,trigger}:{document:OnlineDocument|null;onClose:()=>void;trigger:HTMLElement|null}){
 const [url,setUrl]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[note,setNote]=useState("");
 useEffect(()=>{if(!document)return;let active=true;setBusy(true);setUrl(null);setError("");setNote("");
  fetch(siteUrl(`/api/v1/documents/share?id=${encodeURIComponent(document.id)}`),{credentials:"include",cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);if(active)setUrl(j.url);}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[document]);
 async function change(enable:boolean){if(!document)return;setBusy(true);setError("");setNote("");try{const r=await fetch(siteUrl("/api/v1/documents/share"),{method:enable?"POST":"DELETE",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({id:document.id})});const j=await r.json();if(!r.ok)throw Error(j.error);setUrl(j.url);setNote(enable?"Link created. Copy it to share.":"Link turned off. The old link no longer opens this document.");}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <Dialog.Root open={!!document} onOpenChange={open=>{if(!open&&!busy)onClose();}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/30"/><Dialog.Content className="share-dialog" onCloseAutoFocus={e=>{e.preventDefault();trigger?.focus();}}>
  <Dialog.Title>Share <bdi>{document?.name}</bdi></Dialog.Title><Dialog.Description>Anyone with the link can view and download the latest saved version. They cannot edit your original. Future saves appear at this same link.</Dialog.Description>
  {url?<><label htmlFor="share-url">Read-only link</label><input id="share-url" dir="ltr" readOnly value={url} onFocus={e=>e.target.select()}/><div className="share-actions"><button disabled={busy} onClick={async()=>{try{await navigator.clipboard.writeText(url);setNote("Link copied.");}catch{setNote("Select the link above and copy it manually.");}}}>Copy link</button><a href={url} target="_blank" rel="noopener noreferrer">Preview ↗</a><button disabled={busy} onClick={()=>void change(false)}>Turn off link</button></div><p>Turning off the link cannot remove copies already downloaded.</p></>:<button className="workspace-primary" disabled={busy||!!error} onClick={()=>void change(true)}>{busy?"Checking sharing…":"Create read-only link"}</button>}
  {error&&<p role="alert" className="text-danger">{error}</p>}<p role="status">{note}</p><Dialog.Close disabled={busy}>Done</Dialog.Close>
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
