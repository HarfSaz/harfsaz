import { WorkspaceSignOut } from "./WorkspaceSignOut";
import { ShareDocumentDialog } from "./ShareDocumentDialog";
import { downloadBytes } from "../lib/download";
import { WorkspaceBilling } from "./WorkspaceBilling";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { cloudMe, loginUrl, siteUrl } from "../lib/cloud";
import { useWorkspace } from "../lib/workspace";
import { useDoc } from "../lib/store";
import { languagePatch, type LangCode } from "../lib/languages";
import { newDocumentGuarded, openDocument } from "../lib/documents";
import { documentRequest, openOnlineDocument, useOnlineDocuments, type OnlineDocument } from "../lib/webDocuments";
export function WebWorkspace({children}:{children:ReactNode}) {
  const {profile,view,section,setSection,setAccount,setView}=useWorkspace();
  const {documents,storage,saving}=useOnlineDocuments();
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [sharing,setSharing]=useState<OnlineDocument|null>(null);
  const shareButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{const url=new URL(window.location.href);if(section==="billing")url.searchParams.set("section","billing");else {url.searchParams.delete("section");url.searchParams.delete("checkout");}window.history.replaceState(null,"",url);},[section]);
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      const me=await cloudMe();if(!active)return;
      const previous=useOnlineDocuments.getState().ownerId;
      if(previous&&me?.user.id!==previous){setError("Your sign-in changed. Download any unsaved edits, then reload this page or sign back in to the original account.");setLoading(false);return;}
      if(me){if(!previous){useOnlineDocuments.setState({ownerId:me.user.id});setAccount(me);}await useOnlineDocuments.getState().refresh();}
      if(active)setLoading(false);
    };
    const check=()=>refresh().catch(e=>{if(active){setError(String(e));setLoading(false);}});
    void check();window.addEventListener("focus",check);
    return()=>{active=false;window.removeEventListener("focus",check);};
  },[setAccount]);
  useEffect(()=>{if(profile&&view==="workspace")void useOnlineDocuments.getState().refresh().catch(e=>setError(String(e)));},[view,profile]);
  async function run(fn:()=>Promise<unknown>){setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  function create(lang:LangCode){if(!newDocumentGuarded())return;const state=useDoc.getState();const page=state.pages[0];state.updateFrame(page.id,page.frames[0].id,languagePatch(lang));useDoc.setState({dirty:true});useOnlineDocuments.setState({active:null});setView("editor");}
  async function rename(item:OnlineDocument){
    const active=useOnlineDocuments.getState().active;
    if(useDoc.getState().filePath===`cloud:${item.id}`&&active?.revision!==item.revision)throw new Error("This document changed elsewhere. Reopen it before renaming, or save a copy of your current edits.");
    const name=prompt("Document name",item.name)?.trim();if(!name||name===item.name)return;
    const {document}=await documentRequest<{document:OnlineDocument&{content:unknown}}>("GET",undefined,item.id);
    const result=await documentRequest<{document:OnlineDocument}>("PUT",{id:item.id,revision:item.revision,name,content:document.content,ownerId:profile!.user.id});
    if(useDoc.getState().filePath===`cloud:${item.id}`){useOnlineDocuments.setState({active:result.document});useDoc.setState({fileName:name});}
    await useOnlineDocuments.getState().refresh();
  }
  async function download(item:OnlineDocument){
    const {document}=await documentRequest<{document:OnlineDocument&{content:unknown}}>("GET",undefined,item.id);
    downloadBytes(`${document.name.replace(/[\\/:*?"<>|]/g,"_")}.harfsaz`,JSON.stringify(document.content,null,2),"application/json");
  }
  async function remove(item:OnlineDocument){
    if(!confirm(`Delete “${item.name}” from your online workspace? Download a copy first if you want to keep it.`))return;
    await documentRequest("DELETE",{id:item.id,revision:item.revision});
    if(useDoc.getState().filePath===`cloud:${item.id}`){useOnlineDocuments.setState({active:null});useDoc.setState({filePath:null,dirty:true});}
    await useOnlineDocuments.getState().refresh();
  }
  if(loading)return <main className="desktop-welcome"><p role="status">Opening your online workspace…</p></main>;
  if(!profile)return <main className="desktop-welcome" dir="ltr"><div className="desktop-welcome-card"><p className="workspace-eyebrow">HARFSAZ · ONLINE WORKSPACE</p><h1>Your words, wherever you work.</h1><p>Sign in to create, save, and reopen documents in your account.</p>{error&&<p role="alert">{error}</p>}<a className="workspace-primary" href={loginUrl()}>Sign in to Harfsaz</a><a href={siteUrl("/signup?next=/app/")}>Create an account →</a></div></main>;
  const visible=documents.filter(d=>d.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <ShareDocumentDialog trigger={shareButton.current} document={sharing} onClose={()=>setSharing(null)}/>
    <div hidden={view!=="workspace"} style={{display:view==="workspace"?undefined:"none"}} className="desktop-workspace" dir="ltr">
      <aside className="workspace-sidebar"><a className="workspace-brand" href={siteUrl("/")}>حرف ساز <span>Harfsaz</span></a><p className="workspace-eyebrow">ONLINE WORKSPACE</p><nav aria-label="Workspace"><button className={section==="documents"?"workspace-nav-active":""} aria-current={section==="documents"?"page":undefined} onClick={()=>setSection("documents")}>Documents</button><button className={section==="billing"?"workspace-nav-active":""} aria-current={section==="billing"?"page":undefined} onClick={()=>setSection("billing")}>Plan &amp; billing</button></nav>
        <div className="workspace-account"><span className="account-avatar" aria-hidden="true">{(profile.user.name||profile.user.email).slice(0,1)}</span><strong><bdi>{profile.user.name||"Your account"}</bdi></strong><bdi>{profile.user.email}</bdi><a href={siteUrl("/account")} target="_blank" rel="noopener">Account settings ↗</a><WorkspaceSignOut disabled={busy}/></div>
      </aside>
      <main className="workspace-main">{section==="billing"?<WorkspaceBilling/>:<><header className="workspace-heading"><div><p className="workspace-eyebrow">A PLACE FOR YOUR NEXT IDEA</p><h1>Welcome to your workspace.</h1><p>Create something new, or pick up where you left off.</p></div><button className="workspace-primary" disabled={busy||saving} onClick={()=>run(async()=>{if(await openDocument())setView("editor");})}>Import from computer</button></header>
        {error&&<p className="ai-error" role="alert">{error}</p>}
        <section aria-label="Create a document" className="new-document-grid">{([{lang:"ur",name:"Urdu",sample:"اردو"},{lang:"ar",name:"Arabic",sample:"العربية"},{lang:"fa",name:"Persian",sample:"فارسی"}] as const).map(item=><button className="new-document-card" key={item.lang} disabled={busy||saving} onClick={()=>create(item.lang)}><span className={`document-script script-${item.lang}`} lang={item.lang} dir="rtl">{item.sample}</span><span className="document-card-label"><strong>New {item.name} document</strong><span aria-hidden="true">＋</span></span></button>)}</section>
        <section className="recent-section"><div className="workspace-section-heading"><div><h2>Saved documents</h2><p>{documents.length} documents{storage?` · ${(storage.used/1024/1024).toFixed(1)} of ${Math.round(storage.limit/1024/1024)} MB used`:""}</p></div><label> <span className="sr-only">Search documents</span><input type="search" className="workspace-search" placeholder="Search documents…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
          {visible.length?<ul className="recent-list">{visible.map(item=><li key={item.id}><button className="recent-open" disabled={busy||saving} onClick={()=>run(()=>openOnlineDocument(item.id))}><span className="recent-page" aria-hidden="true">¶</span><span className="recent-name"><strong><bdi>{item.name}</bdi></strong><small>Saved online · {(item.bytes/1024).toFixed(0)} KB</small></span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString()}</time></button><button className="recent-remove" disabled={busy||saving} aria-label={`Download ${item.name}`} onClick={()=>run(()=>download(item))}>Download</button><button className="recent-remove" disabled={busy||saving} aria-label={`Share ${item.name}`} onClick={e=>{shareButton.current=e.currentTarget;setSharing(item);}}>Share</button><button className="recent-remove" disabled={busy||saving} aria-label={`Rename ${item.name}`} onClick={()=>run(()=>rename(item))}>Rename</button><button className="recent-remove" disabled={busy||saving} aria-label={`Delete ${item.name}`} onClick={()=>run(()=>remove(item))}>Delete</button></li>)}</ul>:<div className="workspace-empty"><h3>{query?"No matching documents":"Your next page starts here"}</h3><p>{query?"Try another name.":"Create a document above. Save it in the editor to keep it in your account."}</p></div>}
        </section>
        <button className="quiet-button" onClick={()=>setView("editor")}>Return to current document →</button>
      </>}</main>
    </div>
    <div hidden={view!=="editor"} style={{height:"100%",display:view==="editor"?undefined:"none"}}>{children}</div>
  </>;
}
