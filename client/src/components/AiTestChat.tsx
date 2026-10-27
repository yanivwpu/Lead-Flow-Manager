import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { cartTestPreparationAllowed, preparePrivateCartTest, privateCartPreparationError, privateCartServerTime, PrivateCartResponseError, type PrivateCartTestSummary, type PrivateCartTestRequest } from "@/lib/aiTestCartPreparation";
import { createPrivateCartTestRunner, privateCartConfirmationAllowed, privateCartAttemptKey } from "@/lib/aiTestCartExecution";
import { scheduleTestChatCooldownRefresh } from "@/lib/aiTestChatCooldown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ShoppingActivityView } from "@/components/inbox/ShoppingActivity";
import type { TestChatView, PrivateCheckoutPreflight, SecondCartReview } from "@shared/aiTestChat";
type Diagnostics = {
  aiMode: string;
  shoppingEnabled: boolean;
  catalogConnected: boolean;
  catalogStatus: string;
  inventoryStatus: string;
  retryAt: number | null;
  checkoutPreflightAvailable?: boolean;
  checkoutCartTestAvailable?: boolean;
  checkoutCartExecutionEnabled?: boolean;
};
export function AiTestChat() {
  const { user, sessionAligned } = useAuth();
  if (!user || !sessionAligned) return null;
  return <Console key={user.id} />;
}
function Console() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [attemptedKey,setAttemptedKey]=useState<string>();
  const [cartConfirmation,setCartConfirmation]=useState<{proof:PrivateCheckoutPreflight;version:string}>();
  const [cartConsent,setCartConsent]=useState(false),[cartFailure,setCartFailure]=useState(false);
  const [privateCheckoutUrl,setPrivateCheckoutUrl]=useState<string>();
  const cartRunners=useRef(new Map<string,ReturnType<typeof createPrivateCartTestRunner>>());
  const cartAbort=useRef<AbortController|undefined>(undefined);
  const [open, setOpen] = useState(false),
    [chat, setChat] = useState<TestChatView>(),
    [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const [prepared,setPrepared] = useState<PrivateCartTestRequest>();
  const [prepareError,setPrepareError] = useState<"expired"|"unavailable"|"review">();
  const [reportedRequest,setReportedRequest] = useState<PrivateCartTestSummary>();
  const serverClockOffset = useRef(0);
  const serverNow = () => Date.now()+serverClockOffset.current;
  function observeServerTime(response:Response) {
    serverClockOffset.current=privateCartServerTime(response.headers.get("date"))-Date.now();
    setNow(serverNow());
  }
  const [now,setNow] = useState(Date.now);
  const displayedRequest=prepared??reportedRequest;
  const requestIsLive=!!displayedRequest && Date.parse(displayedRequest.expiresAt)>now;
  const preparing = useRef(false);
  const requestGeneration = useRef(0);
  const selectionVersion = useRef("");
  selectionVersion.current = JSON.stringify([open,chat?.id,chat?.state.updatedAt,chat?.state.selected,chat?.state.quantity]);
  const [secondReview,setSecondReview]=useState<SecondCartReview>();
  const [secondReviewFailed,setSecondReviewFailed]=useState(false);
  const [checkoutResult,setCheckoutResult] = useState<PrivateCheckoutPreflight>();
  const attemptKey=privateCartAttemptKey(user?.id,checkoutResult);
  const cartAttempted=attemptedKey===attemptKey||(()=>{try{return !!sessionStorage.getItem(attemptKey);}catch{return true;}})();
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const pending = useRef<{ eventId: string; text: string } | undefined>(
    undefined,
  );
  const mounted = useRef(true),
    transcriptEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cartAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chat, busy]);
  useEffect(() => { cartAbort.current?.abort(); setCartConfirmation(undefined); setCartConsent(false); setPrivateCheckoutUrl(undefined); setCheckoutResult(undefined); setPrepared(undefined); setReportedRequest(undefined); setPrepareError(undefined); }, [chat?.id,chat?.state.updatedAt]);
  useEffect(() => {
    if (!open) { requestGeneration.current++; setPrepared(undefined); setReportedRequest(undefined); setPrepareError(undefined); setCheckoutResult(undefined); return; }
    setNow(serverNow());
    const timer=setInterval(()=>setNow(serverNow()),1000);
    return ()=>clearInterval(timer);
  },[open]);
  async function approveAndCreateCart() {
    const confirmation=cartConfirmation;
    if(!chat||busy||preparing.current||cartAttempted||!cartConsent||!confirmation||
      !diagnostics?.checkoutCartExecutionEnabled||selectionVersion.current!==confirmation.version)return;
    preparing.current=true;
    const controller=new AbortController();cartAbort.current=controller;
    const generation=requestGeneration.current;
    const current=()=>mounted.current&&!controller.signal.aborted&&selectionVersion.current===confirmation.version&&requestGeneration.current===generation;
    setAttemptedKey(attemptKey);setBusy(true);setCartFailure(false);setPrivateCheckoutUrl(undefined);
    setPrepared(undefined);setReportedRequest(undefined);setCartConfirmation(undefined);setCartConsent(false);
    try {
      const runner=cartRunners.current.get(attemptKey)??createPrivateCartTestRunner();cartRunners.current.set(attemptKey,runner);
      const result=await runner({enabled:diagnostics.checkoutCartExecutionEnabled,confirmed:cartConsent,chat,proof:confirmation.proof,
        current,now:serverNow,claimLocalAttempt:()=>{
          try {if(sessionStorage.getItem(attemptKey))return false;sessionStorage.setItem(attemptKey,"attempted-do-not-retry");return true;}
          catch{return false;}
        },post:async(path,body)=>{
          if(!current())throw Error("private_cart_aborted");
          const response=await fetch(path,{method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
            headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller.signal});
          if(mounted.current)observeServerTime(response);
          if(!response.ok)throw Error("private_cart_stopped_do_not_retry");
          return {data:await response.json(),serverDate:response.headers.get("date")};
        }});
      if(current())setPrivateCheckoutUrl(result.checkoutUrl);
    }catch {if(mounted.current)setCartFailure(true);}
    finally {preparing.current=false;if(mounted.current)setBusy(false);}
  }
  async function prepareCartTest() {
    if(!chat || busy || cartAttempted || preparing.current || prepareError || requestIsLive || !cartTestPreparationAllowed(chat,checkoutResult,serverNow()))return;
    const version=selectionVersion.current, generation=requestGeneration.current;
    preparing.current=true; setBusy(true); setPrepared(undefined); setReportedRequest(undefined); setPrepareError(undefined);
    try {
      const result=await preparePrivateCartTest(chat,checkoutResult,async(path,body)=>{
        const response=await apiRequest("POST",path,body); observeServerTime(response);
        return {data:await response.json(),serverDate:response.headers.get("date")};
      },serverNow);
      if(mounted.current && selectionVersion.current===version && requestGeneration.current===generation)setPrepared(result);
    }catch(failure){if(mounted.current && selectionVersion.current===version && requestGeneration.current===generation){ setPrepareError(privateCartPreparationError(failure));
      if(failure instanceof PrivateCartResponseError)setReportedRequest(failure.summary); }}
    finally {preparing.current=false;if(mounted.current)setBusy(false);}
  }
  async function reviewSecondCart() {
    if(!chat || busy || !diagnostics?.checkoutCartTestAvailable)return;
    const version=selectionVersion.current,generation=++requestGeneration.current;
    setBusy(true);setSecondReview(undefined);setSecondReviewFailed(false);
    // A review can never supply the proof used by the prepare/execute controls.
    setCheckoutResult(undefined);setCartConfirmation(undefined);setCartConsent(false);
    try{
      const response=await apiRequest("POST",`/api/ai/test-chat/${chat.id}/second-cart-review`,{});
      observeServerTime(response);const result=await response.json();
      if(mounted.current && selectionVersion.current===version && requestGeneration.current===generation)setSecondReview(result);
    }catch{if(mounted.current && selectionVersion.current===version && requestGeneration.current===generation)setSecondReviewFailed(true);}
    finally{if(mounted.current)setBusy(false);}
  }
  useEffect(()=>{setSecondReview(undefined);setSecondReviewFailed(false);},[open,chat?.id,chat?.state.updatedAt]);
  async function checkCheckout() {
    if (!chat || busy) return;
    requestGeneration.current++;
    const version=selectionVersion.current, generation=requestGeneration.current;
    setBusy(true); setCheckoutResult(undefined); setCartConfirmation(undefined); setCartConsent(false);
    if(!requestIsLive)setPrepareError(undefined);
    try {
      const response = await apiRequest("POST",`/api/ai/test-chat/${chat.id}/checkout-preflight`,{});
      observeServerTime(response);
      const result = await response.json();
      if (mounted.current && selectionVersion.current===version && requestGeneration.current===generation) setCheckoutResult(result);
    } catch {
      if (mounted.current && selectionVersion.current===version && requestGeneration.current===generation) setCheckoutResult({ready:false,cartCreated:false,cartCreationEnabled:false,
        error:"checkout_preflight_unavailable"});
    } finally { if (mounted.current) setBusy(false); }
  }
  async function diagnose(id: string) {
    try {
      const r = await apiRequest("GET", `/api/ai/test-chat/${id}/diagnostics`);
      const data = await r.json();
      if (mounted.current) setDiagnostics(data);
    } catch {
      if (mounted.current) setDiagnostics(undefined);
    }
  }
  useEffect(() => {
    if (!open || !chat || !diagnostics) return;
    return scheduleTestChatCooldownRefresh(diagnostics, () => { void diagnose(chat.id); });
  }, [open, chat?.id, diagnostics]);
  async function start() {
    setBusy(true);
    setError(false);
    try {
      const r = await apiRequest("POST", "/api/ai/test-chat", {});
      observeServerTime(r);
      const data = await r.json();
      if (mounted.current) {
        setChat(data);
        await diagnose(data.id);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (open && !chat) void start();
  }, [open]);
  async function send() {
    if (!chat || !text.trim() || busy) return;
    const turn =
      pending.current?.text === text.trim()
        ? pending.current
        : { eventId: crypto.randomUUID(), text: text.trim() };
    requestGeneration.current++;
    setPrepared(undefined); setReportedRequest(undefined); setCheckoutResult(undefined); setPrepareError(undefined);
    pending.current = turn;
    setBusy(true);
    setError(false);
    try {
      const r = await apiRequest(
        "POST",
        `/api/ai/test-chat/${chat.id}/turn`,
        turn,
      );
      const data = await r.json();
      if (mounted.current) {
        setChat(data);
        setText("");
        pending.current = undefined;
        await diagnose(chat.id);
      }
    } catch (failure) {
      if (
        failure instanceof Error &&
        failure.message === "409: repeat_as_new_turn"
      )
        pending.current = undefined;
      if (mounted.current) {
        setError(true);
        await diagnose(chat.id);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function reset() {
    if (!chat || busy) return;
    requestGeneration.current++;
    setPrepared(undefined); setReportedRequest(undefined); setCheckoutResult(undefined); setPrepareError(undefined);
    setBusy(true);
    setError(false);
    try {
      await apiRequest("DELETE", `/api/ai/test-chat/${chat.id}`);
      if (mounted.current) {
        setChat(undefined);
        setDiagnostics(undefined);
        setText("");
        pending.current = undefined;
        await start();
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={value=>{
      if(!value){requestGeneration.current++;cartAbort.current?.abort();setCartConfirmation(undefined);setCartConsent(false);setPrivateCheckoutUrl(undefined);}
      setOpen(value);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("testChat.title")}</Button>
      </DialogTrigger>
      <DialogContent
        dir={i18n.dir()}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {t("testChat.title")} · {t("testChat.mode")}
          </DialogTitle>
          <DialogDescription>{t("testChat.description")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {t("testChat.channel")}: Web Chat · {t("testChat.aiMode")}:{" "}
          {diagnostics?.aiMode ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">{t("testChat.scope")}</p>
        {chat && <ShoppingActivityView state={chat.state} />}
        {diagnostics?.checkoutPreflightAvailable && chat && (
          <aside className="rounded border p-3 space-y-2" aria-label={t("testChat.checkoutReadiness")}>
            <p className="text-sm">{t("testChat.checkoutReadOnly")}</p>
            <Button variant="outline" disabled={busy || Date.parse(chat.expiresAt)<=now || chat.state.step!=="confirming" || !chat.state.selected}
              onClick={() => void checkCheckout()}>{t("testChat.checkoutReadiness")}</Button>
            {diagnostics.checkoutCartTestAvailable && <details>
              <summary>{t("testChat.secondReviewTitle")}</summary>
              <p className="text-sm">{t("testChat.secondReviewScope")}</p>
              <Button variant="outline" disabled={busy || Date.parse(chat.expiresAt)<=now || chat.state.step!=="confirming" || !chat.state.selected}
                onClick={()=>void reviewSecondCart()}>{t("testChat.secondReviewRun")}</Button>
              {secondReviewFailed && <p role="alert">{t("testChat.secondReviewUnavailable")}</p>}
              {secondReview && <div role="status" className="text-sm">
                <p>{t(`testChat.secondReviewState.${secondReview.status}`)}</p>
                {secondReview.selection && <p>{secondReview.selection.currency} {secondReview.selection.price} × {secondReview.selection.quantity}</p>}
                {secondReview.inventory && <>
                  <p>{secondReview.inventory.quantity===null?t("testChat.checkoutInventoryUnknown"):t("testChat.checkoutInventory",{quantity:secondReview.inventory.quantity})}</p>
                  <p>{t("testChat.checkoutVerifiedAt")}: {new Date(secondReview.inventory.verifiedAt).toLocaleTimeString()}</p>
                </>}
                <ul>{secondReview.checks.map(check=><li key={check.id}>{t(`testChat.secondReviewChecks.${check.id}`)}: {t(`testChat.secondReviewStatus.${check.status}`)}</li>)}</ul>
              </div>}
            </details>}
            {Date.parse(chat.expiresAt)<=now && <p role="status" className="text-sm">{t("testChat.checkoutSessionExpired")}</p>}
            {!diagnostics.checkoutCartExecutionEnabled && checkoutResult?.ready && cartTestPreparationAllowed(chat,checkoutResult,now) &&
              <Button variant="outline" disabled={busy || cartAttempted || !!prepareError || requestIsLive}
                onClick={()=>void prepareCartTest()}>{t("testChat.prepareCartTest")}</Button>}
            {checkoutResult?.ready && !cartTestPreparationAllowed(chat,checkoutResult,now) &&
              <p className="text-sm">{t(Date.parse(chat.expiresAt)<=now?"testChat.checkoutSessionExpired":"testChat.prepareRefreshReadiness")}</p>}
            {diagnostics.checkoutCartTestAvailable && <section className="space-y-2" aria-label={t("testChat.approveCreateCart")}>
              <Button disabled={!diagnostics.checkoutCartExecutionEnabled||busy||cartAttempted||!privateCartConfirmationAllowed(chat,checkoutResult,now)}
                onClick={()=>{if(checkoutResult?.ready){setCartConfirmation({proof:checkoutResult,version:selectionVersion.current});setCartConsent(false);}}}>
                {t("testChat.approveCreateCart")}</Button>
              {!diagnostics.checkoutCartExecutionEnabled && <p role="status" className="text-sm">{t("testChat.cartActivationRequired")}</p>}
              {cartConfirmation?.proof.ready && <section className="rounded border p-3 space-y-2" aria-label={t("testChat.cartConfirmTitle")}>
                <p className="font-medium">{t("testChat.cartConfirmTitle")}</p>
                <p>{chat.state.selected?.productTitle} / {chat.state.selected?.variantTitle}</p>
                <p>{cartConfirmation.proof.selection.shop} · {cartConfirmation.proof.selection.variantId}</p>
                <p>{cartConfirmation.proof.selection.quantity} × {cartConfirmation.proof.selection.currency} {cartConfirmation.proof.selection.price}</p>
                <p>{t("testChat.checkoutInventory",{quantity:cartConfirmation.proof.inventory.quantity})}</p>
                <p>{t("testChat.checkoutVerifiedAt")}: {new Date(cartConfirmation.proof.inventory.verifiedAt).toLocaleTimeString()}</p>
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={cartConsent} disabled={busy}
                  onChange={event=>setCartConsent(event.target.checked)}/>{t("testChat.cartConsent")}</label>
                <Button disabled={!diagnostics.checkoutCartExecutionEnabled||busy||cartAttempted||!cartConsent||
                  selectionVersion.current!==cartConfirmation.version||!privateCartConfirmationAllowed(chat,cartConfirmation.proof,now)}
                  onClick={()=>void approveAndCreateCart()}>{t("testChat.cartConfirmOnce")}</Button>
                <Button variant="outline" disabled={busy} onClick={()=>{setCartConfirmation(undefined);setCartConsent(false);}}>{t("testChat.cartCancel")}</Button>
              </section>}
              {cartAttempted && !privateCheckoutUrl && <p role={cartFailure?"alert":"status"} className="text-sm">
                {t(busy?"testChat.cartAttemptRunning":"testChat.cartAttemptStopped")}</p>}
              {privateCheckoutUrl && <section className="space-y-2" aria-label={t("testChat.cartCreatedPrivate")}>
                <p role="status">{t("testChat.cartCreatedPrivate")}</p>
                <textarea aria-label={t("testChat.cartPrivateUrl")} value={privateCheckoutUrl} readOnly autoComplete="off" dir="ltr" className="w-full rounded border p-2 text-sm"/>
              </section>}
            </section>}
            {prepareError && <p role="alert" className="text-sm">{t(prepareError==="expired"?"testChat.checkoutSessionExpired":prepareError==="review"?"testChat.prepareResponseReview":"testChat.prepareUnavailable")}</p>}
            {displayedRequest && <section aria-label={t("testChat.preparedCartTest")} className="space-y-2 text-sm">
              <p role="status">{t(Date.parse(displayedRequest.expiresAt)<=now?"testChat.prepareExpired":prepareError==="review"?"testChat.prepareResponseReview":"testChat.prepareApprovalRequired")}</p>
              <p>{t("testChat.prepareExpiresAt")}: <time dateTime={displayedRequest.expiresAt}>{new Date(displayedRequest.expiresAt).toLocaleString()}</time></p>
              <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 select-text">{JSON.stringify(displayedRequest,null,2)}</pre>
            </section>}
            {checkoutResult && <div role="status" className="text-sm">
              <p>{t(checkoutResult.ready ? "testChat.checkoutReady" :
                checkoutResult.error.endsWith("online_store_channel_locked") ? "testChat.checkoutLocked" : "testChat.checkoutUnavailable")}</p>
              {checkoutResult.ready && <>
                <p>{checkoutResult.selection.quantity} × {chat.state.selected?.productTitle} / {chat.state.selected?.variantTitle}
                  {" · "}{checkoutResult.selection.currency} {checkoutResult.selection.price}</p>
                <p>{checkoutResult.inventory.quantity===null ? t("testChat.checkoutInventoryUnknown") :
                  t("testChat.checkoutInventory",{quantity:checkoutResult.inventory.quantity})}</p>
                <p>{t("testChat.checkoutVerifiedAt")}: {new Date(checkoutResult.inventory.verifiedAt).toLocaleTimeString()}</p>
              </>}
            </div>}
          </aside>
        )}
        <div
          role="log"
          aria-label={t("testChat.transcript")}
          aria-live="polite"
          className="h-64 overflow-y-auto space-y-3 rounded border p-3"
        >
          {chat?.transcript.map((m) => (
            <div
              key={m.id}
              dir="auto"
              className={`whitespace-pre-wrap rounded p-2 ${m.role === "user" ? "bg-primary/10 ms-8" : "bg-muted me-8"}`}
            >
              <span className="block text-xs text-muted-foreground">
                {t(`testChat.${m.role}`)} ·{" "}
                {new Date(m.at).toLocaleTimeString()}
              </span>
              {m.content}
            </div>
          ))}
          {busy && <p role="status">{t("testChat.processing")}</p>}
          <div ref={transcriptEnd} />
        </div>
        {diagnostics && (
          <aside
            aria-label={t("testChat.diagnostics")}
            className="text-sm rounded bg-muted p-3 space-y-1"
          >
            <p>
              {t(
                diagnostics.catalogConnected
                  ? "testChat.connected"
                  : "testChat.disconnected",
              )}
            </p>
            <p>{t(`testChat.inventory.${diagnostics.inventoryStatus}`)}</p>
            {diagnostics.retryAt && diagnostics.retryAt > Date.now() && (
              <p>
                {t("testChat.retryAt")}:{" "}
                {new Date(diagnostics.retryAt).toLocaleTimeString()}
              </p>
            )}
            {!diagnostics.shoppingEnabled && <p>{t("testChat.shoppingOff")}</p>}
            <p>{t("shopping.checkoutDisabled")}</p>
          </aside>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            aria-label={t("testChat.message")}
            placeholder={t("testChat.message")}
            className="min-w-0 flex-1 rounded border p-2"
            value={text}
            maxLength={4000}
            disabled={busy || !chat}
            onChange={(e) => setText(e.target.value)}
          />
          <Button disabled={busy || !chat || !text.trim()} type="submit">
            {t("testChat.send")}
          </Button>
        </form>
        {error && <p role="alert">{t("testChat.error")}</p>}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || !chat}
            onClick={() => void reset()}
          >
            {t("testChat.reset")}
          </Button>
          {!chat && error && (
            <Button disabled={busy} onClick={() => void start()}>
              {t("testChat.retry")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
