import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDoc } from "../lib/store";
import { useOnlineDocuments } from "../lib/webDocuments";
import { saveDocument, clearRecovery } from "../lib/documents";
import { siteUrl } from "../lib/cloud";
export function WorkspaceSignOut({disabled=false}:{disabled?:boolean}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const dirty=useDoc(s=>s.dirty);
  const saving=useOnlineDocuments(s=>s.saving);
  async function signOut(save:boolean){
    if(busy||useOnlineDocuments.getState().saving)return;
    setBusy(true);setError("");
    try{
      if(save&&!(await saveDocument())){setError(useDoc.getState().saveError||"Your document was not saved. You are still signed in.");return;}
      useOnlineDocuments.setState({signingOut:true});
      const response=await fetch(siteUrl("/api/v1/auth/logout"),{method:"POST",credentials:"include",headers:{Accept:"application/json"}});
      if(!response.ok)throw Error("Could not sign out. Please try again.");
      const result=await response.json();if(!result.ok)throw Error("Could not confirm sign-out. Please try again.");
      await clearRecovery();
      useDoc.getState().newDocument();
      window.location.assign(siteUrl("/login"));
    }catch(e){setError(e instanceof Error?e.message:"Could not sign out. Check your connection and try again.");}
    finally{useOnlineDocuments.setState({signingOut:false});setBusy(false);}
  }
  return <Dialog.Root open={open} onOpenChange={value=>{if(!busy){setOpen(value);setError("");}}}>
    <Dialog.Trigger asChild><button className="workspace-signout" disabled={disabled||saving}>Sign out</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/30"/><Dialog.Content className="share-dialog">
      <Dialog.Title>{dirty?"Save before signing out?":"Sign out of Harfsaz?"}</Dialog.Title>
      <Dialog.Description>{dirty?"Your current document has unsaved changes. Save them to your account before you leave.":"Your saved documents will be here when you sign back in."}</Dialog.Description>
      {error&&<p role="alert" className="text-danger">{error}</p>}
      <div className="share-actions">
        {dirty&&<button disabled={busy||saving} onClick={()=>void signOut(true)}>{busy?"Please wait…":"Save and sign out"}</button>}
        <button disabled={busy||saving} onClick={()=>void signOut(false)}>{busy&&!dirty?"Signing out…":dirty?"Discard changes and sign out":"Sign out"}</button>
        <Dialog.Close disabled={busy}>Cancel</Dialog.Close>
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
