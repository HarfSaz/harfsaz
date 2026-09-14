import { useEffect, useState } from "react";
import { cloudMe, openAccountPage, siteUrl, type CloudMe } from "../lib/cloud";
import { isTauri } from "../lib/tauri";
import { useWorkspace } from "../lib/workspace";
export function WorkspaceBilling() {
  const [me,setMe]=useState<CloudMe|null>(null),[error,setError]=useState("");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [interval,setIntervalChoice]=useState<"month"|"year">("month");
  const checkout=new URLSearchParams(window.location.search).get("checkout");
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{const account=await cloudMe();if(!active)return;if(!account||account.user.id!==useWorkspace.getState().profile?.user.id){setError("Sign in to your original account to view its billing details.");setMe(null);}else{setMe(account);setError("");}setLoading(false);};
    void refresh();window.addEventListener("focus",refresh);
    const timer=checkout==="success"?window.setInterval(refresh,10000):undefined;
    return()=>{active=false;window.removeEventListener("focus",refresh);if(timer)window.clearInterval(timer);};
  },[checkout]);
  async function billing(action:"checkout"|"portal") {
    if(isTauri()){try{await openAccountPage("pricing");}catch(e){setError(String(e));}return;}
    // Keep this editor tab and unsaved work intact during Stripe checkout.
    const tab=window.open("about:blank","_blank");
    if(!tab){setError("Allow a new tab to open billing, then try again.");return;}
    tab.opener=null;setBusy(true);setError("");
    try{
      const account=await cloudMe();if(!account||account.user.id!==me?.user.id)throw Error("Your sign-in changed. Refresh your workspace before opening billing.");
      const response=await fetch(siteUrl(`/api/v1/billing/${action}`),{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(action==="checkout"?{interval}:{})});
      const result=await response.json();if(!response.ok||!result.url)throw Error(result.error||"Billing is unavailable. Please try again.");
      tab.location.href=result.url;
    }catch(e){tab.close();setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  const paid=me?.plan!=="free";
  const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:me?.billing?.currency||"USD",maximumFractionDigits:0}).format(value);
  return <div className="workspace-billing">
    <header className="workspace-heading"><div><p className="workspace-eyebrow">YOUR WORKSPACE</p><h1>Plan &amp; billing</h1><p>Your AI allowance, subscription, and payment details in one place.</p></div></header>
    {error&&<p className="workspace-error" role="alert">{error}</p>}
    {loading&&<p role="status">Loading your plan…</p>}
    {checkout==="success"&&me&&<p className="workspace-notice" role="status">{paid?"Your paid plan is active.":"Checkout completed. Waiting for payment confirmation to activate your plan…"}</p>}
    {checkout==="cancelled"&&<p className="workspace-notice" role="status">Checkout was cancelled. Your plan has not changed.</p>}
    {me&&<>
      <section className="billing-card" aria-labelledby="current-plan"><p className="workspace-eyebrow">CURRENT PLAN</p><h2 id="current-plan">Harfsaz {me.planName}</h2>
        <p>{paid?`${me.interval==="year"?"Yearly":me.interval==="month"?"Monthly":""} subscription`:"All editing tools, with a free AI allowance."}</p>
        {me.currentPeriodEnd&&<p>{me.cancelAtPeriodEnd?"Ends":"Renews"} {new Date(me.currentPeriodEnd).toLocaleDateString()}</p>}
        {me.status==="past_due"&&<p role="alert" className="text-danger">Payment is overdue. Update your payment method to keep your subscription active.</p>}
        {me.billing?.canManage&&<button className="workspace-primary" disabled={busy} onClick={()=>void billing("portal")}>{busy?"Opening…":"Manage billing ↗"}</button>}
        {me.billing?.canManage&&<p className="workspace-note">View invoices, update your payment method, or cancel your subscription in the billing portal.</p>}
      </section>
      <section className="billing-card" aria-labelledby="usage-title"><h2 id="usage-title">AI usage</h2><p><strong>{me.quota.remaining.toLocaleString()}</strong> of {me.quota.actions.toLocaleString()} actions left {me.quota.window==="day"?"today":"this month"}.</p>
        <progress aria-label="AI actions used" max={Math.max(1,me.quota.actions)} value={Math.min(me.quota.used,me.quota.actions)}/>
        <p className="workspace-note">Resets {new Date(me.quota.resetsAt).toLocaleString()}. Your plan applies to desktop and web AI.</p>
      </section>
      {!paid&&me.billing&&<section className="billing-card billing-card--upgrade" aria-labelledby="upgrade-title"><p className="workspace-eyebrow">MORE ROOM TO WRITE</p><h2 id="upgrade-title">Upgrade to Pro</h2><p>{me.billing.proActions.toLocaleString()} AI actions per month for writing, translation, proofreading and scanning.</p>
        <fieldset disabled={busy} className="billing-options"><legend>Billing frequency</legend><label><input type="radio" name="billing-interval" checked={interval==="month"} onChange={()=>setIntervalChoice("month")}/> Monthly · {money(me.billing.proMonthly)} / month</label>{me.billing.proYearly!==null&&<label><input type="radio" name="billing-interval" checked={interval==="year"} onChange={()=>setIntervalChoice("year")}/> Yearly · {money(me.billing.proYearly)} / year</label>}</fieldset>
        <button className="workspace-primary" disabled={busy} onClick={()=>void billing("checkout")}>{busy?"Opening checkout…":isTauri()?"Continue in browser ↗":"Upgrade to Pro ↗"}</button><p className="workspace-note">Prices in {me.billing.currency}. Any applicable tax is shown at checkout. Checkout opens in a new tab.</p>
      </section>}
      <p className="workspace-note">Questions about a payment? <a href="mailto:billing@harfsaz.com">billing@harfsaz.com</a></p>
    </>}
  </div>;
}
