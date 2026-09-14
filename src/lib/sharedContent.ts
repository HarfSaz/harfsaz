import DOMPurify from "dompurify";
const STYLES=new Set(["color","background-color","font-size","font-weight","font-style","font-family","text-decoration","text-align","line-height","letter-spacing","white-space","direction","margin-left","margin-right","margin-top","margin-bottom","padding","padding-left","padding-right","border","border-width","border-color","border-style","border-collapse","width","height","vertical-align"]);
/** Shared documents are untrusted: retain typography, never scripts or remote resources. */
export function safeSharedHtml(html:string):string {
  const fragment=DOMPurify.sanitize(html,{RETURN_DOM_FRAGMENT:true,ALLOWED_TAGS:["p","div","br","span","strong","em","b","i","u","s","sup","sub","ol","ul","li","table","thead","tbody","tfoot","tr","th","td","caption","colgroup","col"],ALLOWED_ATTR:["style","dir","lang","colspan","rowspan","start"],ALLOW_DATA_ATTR:false});
  const tags=new Set(["p","div","br","span","strong","em","b","i","u","s","sup","sub","ol","ul","li","table","thead","tbody","tfoot","tr","th","td","caption","colgroup","col"]);
  const attributes=new Set(["style","dir","lang","colspan","rowspan","start"]);
  // Enforce the document format again on the resulting DOM, including in
  // alternate DOM implementations used by import and rendering tests.
  for(const node of fragment.querySelectorAll<HTMLElement>("*")){
    if(node.namespaceURI!=="http://www.w3.org/1999/xhtml"||!tags.has(node.tagName.toLowerCase())){node.remove();continue;}
    for(const attr of Array.from(node.attributes)){if(!attributes.has(attr.name))node.removeAttribute(attr.name);}

    for(const key of Array.from(node.style)){if(!STYLES.has(key)||/url\s*\(|expression|@import|var\s*\(/i.test(node.style.getPropertyValue(key)))node.style.removeProperty(key);}
  }
  const holder=document.createElement("div");holder.append(fragment);return holder.innerHTML;
}
export function sharedImage(src:unknown):string|undefined {return typeof src==="string"&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(src)?src:undefined;}
export function sharedColor(value:unknown,fallback:string):string {return typeof value==="string"&&!/url|var\(|expression/i.test(value)&&CSS.supports("color",value)?value:fallback;}
