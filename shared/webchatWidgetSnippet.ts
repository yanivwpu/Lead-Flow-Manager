/**
 * Canonical public widget install snippets.
 * All install surfaces must use widgetPublicId (wgt_…) — never users.id.
 */

export type WebchatWidgetSnippetInput = {
  baseUrl: string;
  widgetPublicId: string;
};

export function normalizeWidgetBaseUrl(baseUrl: string): string {
  return String(baseUrl || "").trim().replace(/\/$/, "");
}

export function buildWebchatScriptSnippet(input: WebchatWidgetSnippetInput): string {
  const baseUrl = normalizeWidgetBaseUrl(input.baseUrl);
  const widgetPublicId = String(input.widgetPublicId || "").trim();
  if (!baseUrl || !widgetPublicId) return "";
  return `<!-- WhachatCRM Chat Widget -->
<script>
  (function(w,d,o,f){
    w['WhachatWidget']=o;
    var js=d.createElement('script');
    js.src=f+'?id=${widgetPublicId}';
    js.async=true;
    js.setAttribute('fetchpriority','low');
    d.head.appendChild(js);
  }(window,document,'wcw','${baseUrl}/widget.js'));
</script>`;
}

export function buildWebchatIframeSnippet(input: WebchatWidgetSnippetInput): string {
  const baseUrl = normalizeWidgetBaseUrl(input.baseUrl);
  const widgetPublicId = String(input.widgetPublicId || "").trim();
  if (!baseUrl || !widgetPublicId) return "";
  return `<iframe
  src="${baseUrl}/widget-frame/${widgetPublicId}"
  style="position:fixed;bottom:20px;right:20px;width:380px;height:620px;border:none;z-index:9999;"
></iframe>`;
}

export function buildWebchatIframeParentSnippet(input: WebchatWidgetSnippetInput): string {
  const baseUrl = normalizeWidgetBaseUrl(input.baseUrl);
  const widgetPublicId = String(input.widgetPublicId || "").trim();
  if (!baseUrl || !widgetPublicId) return "";
  const frameBase = `${baseUrl}/widget-frame/${widgetPublicId}`;
  return `<!-- WhachatCRM — floating iframe + parent URL (for page rules) -->
<script>
(function(){
  var base=${JSON.stringify(frameBase)};
  var f=document.createElement('iframe');
  f.src=base+'?parentUrl='+encodeURIComponent(window.location.href);
  f.setAttribute('title','WhachatCRM chat');
  f.style.cssText='position:fixed;bottom:20px;right:20px;width:380px;height:620px;border:none;z-index:9999;';
  document.body.appendChild(f);
})();
</script>`;
}

export function buildWebchatHostedChatUrl(input: WebchatWidgetSnippetInput & { leadSource?: string }): string {
  const baseUrl = normalizeWidgetBaseUrl(input.baseUrl);
  const widgetPublicId = String(input.widgetPublicId || "").trim();
  if (!baseUrl || !widgetPublicId) return "";
  const leadSource = String(input.leadSource || "").trim();
  return leadSource
    ? `${baseUrl}/chat/${widgetPublicId}?source=${encodeURIComponent(leadSource)}`
    : `${baseUrl}/chat/${widgetPublicId}`;
}
