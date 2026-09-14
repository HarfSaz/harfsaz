import { create } from "zustand";
import { cloudMe, siteUrl } from "./cloud";
import { useDoc, type DocFile } from "./store";
import { useWorkspace } from "./workspace";
export interface OnlineDocument {id:string;name:string;revision:number;bytes:number;updatedAt:string;createdAt:string}
export class DocumentError extends Error {constructor(message:string,public status:number){super(message);}}
export async function documentRequest<T>(method:string,body?:unknown,id?:string):Promise<T>{
  let response:Response;
  try{response=await fetch(siteUrl(`/api/v1/documents${id?`?id=${encodeURIComponent(id)}`:""}`),{method,credentials:"include",cache:"no-store",headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});}
  catch{throw new DocumentError("Could not reach your workspace. Your edits are still here; retry when connected or download a copy.",0);}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new DocumentError(result.error||"Could not access your documents.",response.status);
  return result;
}
interface OnlineState {documents:OnlineDocument[];active:OnlineDocument|null;ownerId:string|null;saving:boolean;signingOut:boolean;storage:{used:number;limit:number}|null;refresh:()=>Promise<void>}
export const useOnlineDocuments=create<OnlineState>((set)=>({documents:[],active:null,ownerId:null,saving:false,signingOut:false,storage:null,
  refresh:async()=>{const result=await documentRequest<{documents:OnlineDocument[];storage:{used:number;limit:number}}>("GET");set(result);},
}));
let flight:Promise<boolean>|null=null;
/** Serialize saves and keep edits made during a network request dirty. */
export function saveOnlineDocument(copy=false,automatic=false):Promise<boolean>{
  if(useOnlineDocuments.getState().signingOut)return Promise.resolve(false);
  if(flight)return flight;
  flight=save(copy,automatic).finally(()=>{flight=null;useOnlineDocuments.setState({saving:false});});
  return flight;
}
async function save(copy:boolean,automatic:boolean):Promise<boolean>{
  const initial=useDoc.getState();const epoch=initial.documentEpoch;
  const owner=useOnlineDocuments.getState().ownerId;
  if(!owner){initial.setSaveError("Sign in to save documents to your account.");return false;}
  const active=useOnlineDocuments.getState().active;
  const current=initial.filePath===`cloud:${active?.id}`?active:null;
  if(automatic&&(!initial.dirty||!current))return false;
  let name=initial.fileName||"Untitled";
  if(!automatic&&(!current||copy)){
    const entered=prompt(copy?"Name your online copy":"Name your document",copy?`${name} copy`:name);
    if(entered===null)return false;name=entered.trim();if(!name||name.length>200){initial.setSaveError("Use a document name between 1 and 200 characters.");return false;}
  }
  const content=initial.toDocFile(),written=JSON.stringify(content);
  useOnlineDocuments.setState({saving:true});
  try{
    // Prevent an old editor tab from silently saving under a different account.
    const me=await cloudMe();if(me?.user.id!==owner)throw new DocumentError("Your account changed or session expired. Sign in to the original account, or download your edits.",401);
    const {document}=await documentRequest<{document:OnlineDocument}>(current&&!copy?"PUT":"POST",{name,content,ownerId:owner,...(current&&!copy?{id:current.id,revision:current.revision}:{})});
    const now=useDoc.getState();
    if(now.documentEpoch!==epoch||useOnlineDocuments.getState().ownerId!==owner)return false;
    useOnlineDocuments.setState({active:document});
    if(JSON.stringify(now.toDocFile())===written){now.markSaved(`cloud:${document.id}`,document.name);
      try {localStorage.removeItem(`harfsaz.web.recovery.v2.${owner}`);} catch { /* best effort */ }}
    else useDoc.setState({filePath:`cloud:${document.id}`,fileName:document.name,dirty:true,saveError:null});
    void useOnlineDocuments.getState().refresh().catch(()=>{});
    return !useDoc.getState().dirty;
  }catch(e){if(useDoc.getState().documentEpoch===epoch)useDoc.getState().setSaveError(e instanceof Error?e.message:String(e));return false;}
}
export async function openOnlineDocument(id:string):Promise<boolean>{
  if(useOnlineDocuments.getState().saving)return false;
  if(useDoc.getState().dirty&&!confirm("Discard unsaved changes and open this document?"))return false;
  const epoch=useDoc.getState().documentEpoch;
  const before=JSON.stringify(useDoc.getState().toDocFile());
  const {document}=await documentRequest<{document:OnlineDocument&{content:DocFile}}>("GET",undefined,id);
  if(useDoc.getState().documentEpoch!==epoch||JSON.stringify(useDoc.getState().toDocFile())!==before)throw new DocumentError("The current document changed while opening. Try again after saving your edits.",409);
  useDoc.getState().loadDocument(document.content,`cloud:${document.id}`,document.name);
  useOnlineDocuments.setState({active:document});useWorkspace.getState().setView("editor");return true;
}
