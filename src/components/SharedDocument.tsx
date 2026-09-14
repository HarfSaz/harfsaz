import { useEffect, useState, useMemo } from "react";
import type { DocFile, TextFrame } from "../lib/store";
import { siteUrl } from "../lib/cloud";
import { downloadBytes } from "../lib/download";
import { ensureAllDocumentFonts, getFont } from "../lib/font";
import { safeSharedHtml, sharedImage, sharedColor } from "../lib/sharedContent";
import { SHAPES, shapePaint, shapePath } from "../editor/shapeGeometry";
import { pageNumber } from "../editor/publishing";
interface SharedFile {name:string;content:DocFile;updatedAt:string}
const number=(value:unknown,fallback:number)=>typeof value==="number"&&Number.isFinite(value)?Math.max(-20000,Math.min(20000,value)):fallback;
function ReadOnlyFrame({frame}:{frame:TextFrame}){
  const html=useMemo(()=>typeof frame.html==="string"?safeSharedHtml(frame.html):undefined,[frame.html]);
  const width=Math.max(1,number(frame.width,600)),height=Math.max(1,number(frame.height,100));
  const color=sharedColor(frame.color,"#1a1714"),fill=sharedColor(frame.fill,"transparent"),borderColor=sharedColor(frame.borderColor,"transparent");
  const borderWidth=Math.max(0,Math.min(30,number(frame.borderWidth,0)));
  const shape=SHAPES.find(s=>s.kind===frame.shape)?.kind??"rect";
  const paint=shapePaint(shape,fill,borderWidth,borderColor);
  return <div style={{position:"absolute",left:number(frame.x,0),top:number(frame.y,0),width,height,overflow:"hidden",boxSizing:"border-box",background:frame.kind==="shape"?undefined:fill,border:frame.kind==="shape"?undefined:`${borderWidth}px solid ${borderColor}`}}>
    {frame.kind==="image"?(sharedImage(frame.src)?<img src={sharedImage(frame.src)} alt={frame.text||"Document image"} style={{width:"100%",height:"100%",objectFit:frame.fit==="cover"?"cover":"contain"}}/>:<p>Image unavailable</p>):frame.kind==="shape"?<svg width={width} height={height} aria-label={shape}><path d={shapePath(shape,width,height,paint.strokeWidth)} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth}/></svg>:
      <div className="shared-text" dir={frame.dir==="ltr"?"ltr":"rtl"} lang={typeof frame.lang==="string"?frame.lang:"ur"} style={{color,fontFamily:getFont(frame.fontKey).cssFamily,fontSize:Math.max(1,number(frame.fontSize,24)),lineHeight:Math.max(.5,Math.min(5,number(frame.lineHeight,1.7))),letterSpacing:number(frame.letterSpacing,0),fontWeight:frame.bold?700:400,fontStyle:frame.italic?"italic":"normal",textDecoration:frame.underline?"underline":undefined,textAlign:["right","left","center","justify"].includes(frame.align)?frame.align:"right",whiteSpace:"pre-wrap",overflowWrap:"break-word"}}>{html?<div dangerouslySetInnerHTML={{__html:html}}/>:frame.text}</div>}
  </div>;
}
export function SharedDocument({token}:{token:string}){
  const [file,setFile]=useState<SharedFile|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [zoom,setZoom]=useState(.85);
  useEffect(()=>{
    let active=true;document.title="Shared document — Harfsaz";
    const refresh=async()=>{try{const response=await fetch(siteUrl(`/api/v1/shared?token=${encodeURIComponent(token)}`),{cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});const result=await response.json();if(!active)return;if(!response.ok){setFile(null);throw Error(result.error||"Shared document unavailable.");}setFile(result.document);setError("");document.title=`${result.document.name} — Harfsaz`;void ensureAllDocumentFonts(result.document.content.pages.flatMap((p:DocFile["pages"][number])=>p.frames.map(f=>f.fontKey))).catch(()=>{});}catch(e){if(active)setError(e instanceof Error?e.message:String(e));}finally{if(active)setLoading(false);}};
    void refresh();window.addEventListener("focus",refresh);const timer=window.setInterval(refresh,30000);
    return()=>{active=false;window.removeEventListener("focus",refresh);window.clearInterval(timer);};
  },[token]);
  return <div className="shared-view"><header className="shared-header"><div><a href={siteUrl("/app")}>Harfsaz</a><h1><bdi>{file?.name||"Shared document"}</bdi></h1><p>Read-only · Latest saved version</p></div>{file&&<div className="shared-controls"><label>Zoom <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[.25,.5,.75,.85,1,1.25].map(n=><option key={n} value={n}>{Math.round(n*100)}%</option>)}</select></label><button onClick={()=>downloadBytes(`${file.name.replace(/[\\/:*?"<>|]/g,"_")}.harfsaz`,JSON.stringify(file.content,null,2),"application/json")}>Download .harfsaz</button></div>}</header>
    {loading&&<p role="status">Opening shared document…</p>}{error&&<p className="workspace-error" role="alert">{error}</p>}
    <main className="shared-pages" aria-label="Read-only document">{file?.content.pages.map((page,i)=><div key={`${page.id}-${i}`} style={{width:page.width*zoom,height:page.height*zoom,position:"relative",flexShrink:0}}><article aria-label={`Page ${i+1}`} className="shared-page" style={{position:"relative",background:"white",width:page.width,height:page.height,transform:`scale(${zoom})`,transformOrigin:"top left",overflow:"hidden"}}>{page.frames.map((frame,j)=><ReadOnlyFrame key={`${frame.id}-${j}`} frame={frame}/>)}{page.pageNumber&&<div style={{position:"absolute",bottom:4,width:"100%",textAlign:"center"}}>{pageNumber(page.pageNumber.value,page.pageNumber.style)}</div>}</article></div>)}</main>
  </div>;
}
