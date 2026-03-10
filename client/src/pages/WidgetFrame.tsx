import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";

export function WidgetFrame() {
  const [match, params] = useRoute("/widget-frame/:widgetId");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (params?.widgetId) {
      setIsLoading(false);
    }
  }, [params?.widgetId]);

  if (!match || !params?.widgetId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-sm text-gray-500">Widget not found</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 text-brand-green animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3">
          <div className="flex justify-start">
            <div className="max-w-xs bg-gray-200 text-gray-900 rounded-xl px-4 py-2 text-sm">
              Hi! How can we help you today?
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green"
            />
            <button className="px-4 py-2 bg-brand-green text-white rounded-lg text-sm font-medium hover:bg-brand-green/90">
              Send
            </button>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,o,f,js,fjs){
              w['WhachatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
              js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
              js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
            }(window,document,'script','wcw','${window.location.origin}/widget.js'));
            wcw('init', '${params.widgetId}');
          `
        }}
      />
    </div>
  );
}
