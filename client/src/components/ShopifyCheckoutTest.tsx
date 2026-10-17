import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Preflight = {
  requestId:string; selectionSha256:string; expiresAt:string; productTitle:string;
  selection:{shop:string;productId:string;variantId:string;quantity:number;price:string;currency:string;options:{name:string;value:string}[]};
};
const base='/api/sales-catalog/commerce/checkout-test';
// Private local state only: never query cache, storage, transcripts, analytics or AI context.
export function ShopifyCheckoutTest() {
  const [allowed,setAllowed]=useState(false), [preflight,setPreflight]=useState<Preflight>(),
    [approved,setApproved]=useState(false), [confirmed,setConfirmed]=useState(false),
    [busy,setBusy]=useState(false), [error,setError]=useState(''), [url,setUrl]=useState(''),
    [attempted,setAttempted]=useState(false);
  useEffect(()=>{let active=true;fetch(`${base}/access`,{credentials:'include',cache:'no-store'})
    .then(r=>{if(active)setAllowed(r.ok);}).catch(()=>{});return()=>{active=false;};},[]);
  if(!allowed)return null;
  async function run(action:'preflight'|'approve'|'create') {
    setBusy(true);setError('');
    if(action==='preflight'){setPreflight(undefined);setApproved(false);setConfirmed(false);setUrl('');}
    if(action==='create')setAttempted(true);
    try {
      const body=action==='preflight'?{}:{requestId:preflight!.requestId,selectionSha256:preflight!.selectionSha256,
        ...(action==='approve'?{confirmation:'CREATE EXACTLY ONE DEVELOPMENT STORE CART'}:{})};
      const r=await fetch(`${base}/${action}`,{method:'POST',credentials:'include',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await r.json();
      if(!r.ok){setError(data.error || 'Checkout test unavailable');return;}
      if(action==='preflight')setPreflight(data);
      if(action==='approve')setApproved(true);
      if(action==='create')setUrl(data.checkoutUrl);
    } catch {setError(action==='create'?'Result uncertain. Do not retry; the durable claim remains consumed.':'Verification unavailable.');}
    finally {setBusy(false);}
  }
  const expired=!!preflight&&Date.parse(preflight.expiresAt)<=Date.now();
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Shopify Checkout Test">
    <h4 className="font-semibold">Shopify Checkout Test</h4>
    <p>Developer only. A test cart is not a paid order. Customer checkout remains off.</p>
    <p>Development store: whachatcrm.myshopify.com · Quantity: 1</p>
    {!preflight&&<p>Target: The Collection Snowboard: Hydrogen. Price, options, publication and inventory are unverified until live preflight.</p>}
    <Button disabled={busy||attempted} onClick={()=>run('preflight')}>Verify Shopify Checkout Readiness</Button>
    {preflight&&<>
      <dl className="text-sm space-y-1">
        <dt>Selected product</dt><dd>{preflight.productTitle} ({preflight.selection.productId})</dd>
        <dt>Exact variant</dt><dd>{preflight.selection.variantId}</dd>
        <dt>Options</dt><dd>{preflight.selection.options.map(o=>`${o.name} / ${o.value}`).join(', ')}</dd>
        <dt>Verified unit price</dt><dd>{preflight.selection.price} {preflight.selection.currency}</dd>
        <dt>Live verification</dt><dd>Development plan, app identity, permissions, publication, inventory and Storefront accessibility verified.</dd>
        <dt>Readiness</dt><dd>Ready for separate authorization. Expires {new Date(preflight.expiresAt).toLocaleString()}.</dd>
        <dt>Selection digest</dt><dd className="break-all">{preflight.selectionSha256}</dd>
      </dl>
      {!approved&&<>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy||expired} onChange={e=>setConfirmed(e.target.checked)}/>
          I have reviewed these live results and authorize exactly one test cart for this selection. No order or payment.</label>
        <Button disabled={!confirmed||busy||expired} onClick={()=>run('approve')}>Record One-Time Operator Authorization</Button>
      </>}
      {approved&&<Button disabled={busy||expired||attempted} onClick={()=>run('create')}>Create One Test Shopify Cart</Button>}
    </>}
    {url&&<p>Cart verified; payment status unknown. Open manually and inspect any redirect before proceeding. Do not enter customer information or submit payment.{' '}
      <a className="underline" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open Shopify test checkout</a></p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
