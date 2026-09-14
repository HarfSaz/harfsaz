import { WorkspaceBilling } from "./WorkspaceBilling";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { desktopAccount, useWorkspace } from "../lib/workspace";
import { useDoc } from "../lib/store";
import { newDocumentGuarded, openDocument, resetRecoveryOffer } from "../lib/documents";
import { languagePatch, type LangCode } from "../lib/languages";

export function DesktopWorkspace({ children }: { children: ReactNode }) {
  const { profile, offline, view, section, setSection, recents, setAccount, setView, forget } = useWorkspace();
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [pair,setPair]=useState<{code:string;url:string}|null>(null);
  const [query,setQuery]=useState("");
  const generation=useRef(0);
  const dirty=useDoc(s=>s.dirty), filePath=useDoc(s=>s.filePath),fileName=useDoc(s=>s.fileName);
  const hasDocument=dirty||!!filePath;
  const accept=(result:Awaited<ReturnType<typeof desktopAccount>>)=>{
    if(result.status==="signed_in"&&result.profile){setAccount(result.profile,result.offline);setPair(null);setError("");}
  };
  useEffect(()=>{
    let active=true;
    desktopAccount("status").then(result=>{if(active)accept(result);}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!pair)return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {const result=await desktopAccount("poll");if(!active)return;
        if(result.status==="signed_in"){accept(result);return;}
        if(result.status==="expired"){setPair(null);setError("The sign-in code expired. Start again to get a new code.");return;}
      }catch(e){if(active)setError(String(e));}
      if(active)timer=setTimeout(poll,2500);
    };
    timer=setTimeout(poll,1500);return()=>{active=false;clearTimeout(timer);};
  },[pair]);
  useEffect(()=>{
    if(!profile)return;
    return useDoc.subscribe((state,previous)=>{
      if(state.filePath&&(state.filePath!==previous.filePath||state.lastSavedAt!==previous.lastSavedAt)){
        useWorkspace.getState().remember({path:state.filePath,name:state.fileName,openedAt:Date.now(),pages:state.pages.length,language:state.pages[0]?.frames[0]?.lang??"ur"});
      }
    });
  },[profile?.user.id]);
  async function startSignIn(){const request=++generation.current;setBusy(true);setError("");
    try{const result=await desktopAccount("begin");if(request!==generation.current)return;if(result.code&&result.url)setPair({code:result.code,url:result.url});}
    catch(e){setError(String(e));}finally{if(request===generation.current)setBusy(false);}
  }
  async function cancelSignIn(){generation.current++;setPair(null);setBusy(false);setError("");await desktopAccount("cancel").catch(()=>{});}
  async function open(path?:string){setBusy(true);setError("");try{if(await openDocument(path))setView("editor");}catch(e){setError(String(e));}finally{setBusy(false);}}
  function create(lang:LangCode){if(!newDocumentGuarded())return;const selected=useDoc.getState().getSelectedFrame();if(selected)useDoc.getState().updateFrame(selected.page.id,selected.frame.id,{...languagePatch(lang),text:"",html:""});setView("editor");}
  async function logout(){if(!newDocumentGuarded())return;setBusy(true);setError("");try{await desktopAccount("logout");resetRecoveryOffer();setAccount(null);setQuery("");}catch(e){setError(String(e));}finally{setBusy(false);}}
  const visible=recents.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()));
  if(loading)return <main className="desktop-welcome"><div className="welcome-content"><p className="workspace-eyebrow">HARFSAZ</p><h1>Opening your workspace…</h1><p role="status">Checking your account</p></div></main>;
  if(!profile)return <main className="desktop-welcome" dir="ltr">
    <div className="welcome-art" aria-hidden="true"><div className="welcome-sheet"><img src={`${import.meta.env.BASE_URL}logo.png`} alt=""/><span lang="ur" dir="rtl">ہر لفظ ایک آغاز</span><i/><i/><i/></div><p>اردو · العربية · فارسی</p></div>
    <section className="welcome-content"><p className="workspace-eyebrow">YOUR WORDS, BEAUTIFULLY SET</p><h1>A place for<br/>your next page.</h1><p className="welcome-description">Sign in to Harfsaz to open your workspace, return to recent documents, and start something new.</p>
      {pair?<div className="pairing-card"><h2>Confirm in your browser</h2><p>Sign in or create an account, then approve this matching code.</p><strong className="pairing-code">{pair.code}</strong><p role="status">Waiting for your approval…</p><button onClick={()=>desktopAccount("reopen").catch(e=>setError(String(e)))}>Reopen sign-in page ↗</button><button className="quiet-button" onClick={cancelSignIn}>Cancel</button></div>:
      <><button className="workspace-primary welcome-action" disabled={busy} onClick={startSignIn}>{busy?"Opening sign-in…":"Sign in or create account"}<span aria-hidden="true">↗</span></button><p className="workspace-note">Your browser handles passwords and Google sign-in. Your documents stay on this computer.</p></>}
      {error&&<p role="alert" className="workspace-error">{error}</p>}
    </section>
  </main>;
  return <>
    <div hidden={view!=="workspace"} className="desktop-workspace" dir="ltr">
      <aside className="workspace-sidebar"><div className="workspace-brand"><img src={`${import.meta.env.BASE_URL}logo.png`} alt=""/><strong>Harfsaz</strong></div>
        <nav aria-label="Workspace"><button className={section==="documents"?"workspace-nav-active":""} aria-current={section==="documents"?"page":undefined} onClick={()=>setSection("documents")}>Documents</button><button className={section==="billing"?"workspace-nav-active":""} aria-current={section==="billing"?"page":undefined} onClick={()=>setSection("billing")}>Plan &amp; billing</button><button onClick={()=>desktopAccount("manage").catch(e=>setError(String(e)))}>Account settings ↗</button></nav>
        <div className="workspace-account"><span className="account-avatar" aria-hidden="true">{(profile.user.name||profile.user.email).slice(0,1).toUpperCase()}</span><strong>{profile.user.name||"Your account"}</strong><bdi>{profile.user.email}</bdi><span className="plan-badge">{profile.planName||profile.plan} plan{offline?" · Offline":""}</span><button disabled={busy} onClick={logout}>Sign out</button></div>

      </aside>
      <main className="workspace-main">{section==="billing"?<WorkspaceBilling/>:<><header className="workspace-heading"><div><p className="workspace-eyebrow">YOUR WORKSPACE</p><h1>Make room for your words.</h1><p>Create a document or pick up where you left off.</p></div><button className="workspace-open" disabled={busy} onClick={()=>open()}>Open document <span aria-hidden="true">↗</span></button></header>
        {offline&&<p className="workspace-notice" role="status">You’re offline. Local documents are available; account details show the last successful sync.</p>}
        {error&&<p role="alert" className="workspace-error">{error}</p>}
        <section aria-labelledby="new-document-heading"><div className="workspace-section-heading"><h2 id="new-document-heading">Start a new document</h2><span>A4 · Blank page</span></div><div className="new-document-grid">
          {([{lang:"ur",name:"Urdu",sample:"اردو",detail:"Nastaliq"},{lang:"ar",name:"Arabic",sample:"العربية",detail:"Naskh"},{lang:"fa",name:"Persian",sample:"فارسی",detail:"Persian text"}] as const).map(item=><button key={item.lang} className="new-document-card" disabled={busy} onClick={()=>create(item.lang)}><span className={`document-script script-${item.lang}`} lang={item.lang} dir="rtl">{item.sample}</span><span className="document-card-label"><span><strong>{item.name}</strong><small>{item.detail}</small></span><span aria-hidden="true">＋</span></span></button>)}
        </div></section>
        {hasDocument&&<button className="resume-document" onClick={()=>setView("editor")}><span>Continue editing <strong>{fileName}</strong>{dirty?" · Unsaved changes":""}</span><span aria-hidden="true">→</span></button>}
        <section className="recent-section" aria-labelledby="recent-heading"><div className="workspace-section-heading"><h2 id="recent-heading">Recent documents</h2><input aria-label="Search recent documents" type="search" placeholder="Find a document…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
          {visible.length?<ul className="recent-list">{visible.map(item=><li key={item.path}><button className="recent-open" disabled={busy} onClick={()=>open(item.path)} title={item.path}><span className="recent-page" aria-hidden="true">¶</span><span className="recent-name"><strong>{item.name}</strong><small>{item.pages} {item.pages===1?"page":"pages"} · {item.language.toUpperCase()}</small></span><time dateTime={new Date(item.openedAt).toISOString()}>{new Date(item.openedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time></button><button className="recent-remove" aria-label={`Remove ${item.name} from recent documents`} title="Remove from history; keep the file" onClick={()=>forget(item.path)}>×</button></li>)}</ul>:
          <div className="workspace-empty"><span aria-hidden="true">▤</span><h3>{query?"No matching documents":"Your next page starts here"}</h3><p>{query?"Try another name.":"Documents you open or save will appear here. Open an existing file or create your first document above."}</p></div>}
          <p className="workspace-note">Recent documents are stored on this computer. Removing an item from this list does not delete the file.</p>
        </section>
      </>}</main>
    </div>
    <div hidden={view!=="editor"} style={{height:"100%"}}>{children}</div>
  </>;
}
