import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRegionalDate } from "@/lib/regionalFormatting";
import { Search as SearchIcon, MessageSquare, Clock, Loader2, ArrowRight, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { TAG_COLORS } from "@/lib/data";

interface SearchResult {
  chatId: string;
  chatName: string;
  avatar: string;
  matchedText: string;
  timestamp: string;
  pipelineStage: string;
  tag: string;
}

export function Search() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        setDebouncedQuery(query);
      } else {
        setDebouncedQuery("");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading, error } = useQuery<SearchResult[]>({
    queryKey: ["/api/messages/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/messages/search?q=${encodeURIComponent(debouncedQuery)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  const quickFilters = [
    { label: t("conversationSearch.proposals"), query: "proposal", id: "proposals" },
    { label: t("conversationSearch.payment"), query: "payment" },
    { label: t("conversationSearch.thankYou"), query: "thank you", id: "thank-you" },
    { label: t("conversationSearch.quote"), query: "quote" },
    { label: t("conversationSearch.meeting"), query: "meeting" },
    { label: t("conversationSearch.call"), query: "call" },
  ];

  return (
    <div className="flex-1 h-full bg-white flex flex-col overflow-hidden">
      <div className="border-b bg-gray-50/50 p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("conversationSearch.title")}</h1>
          <p className="text-gray-500 mb-4">{t("conversationSearch.subtitle")}</p>
          
          <div className="relative">
            <SearchIcon className="absolute start-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-14 ps-12 pe-12 bg-white border border-gray-200 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green shadow-sm"
              dir="auto"
              aria-label={t("conversationSearch.title")}
              placeholder={t("conversationSearch.placeholder")}
              autoFocus
              data-testid="input-search"
            />
            {isLoading && (
              <Loader2 className="absolute end-4 top-1/2 -translate-y-1/2 h-5 w-5 text-brand-green animate-spin" />
            )}
          </div>
          
          <div className="mt-4 flex flex-wrap gap-2">
            {quickFilters.map(filter => (
              <button
                key={filter.query}
                onClick={() => setQuery(filter.query)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-brand-green hover:text-brand-green hover:bg-brand-green/5 cursor-pointer transition-colors"
                data-testid={`button-filter-${filter.id ?? filter.query}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {!debouncedQuery && (
            <div className="text-center py-12">
              <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500">{t("conversationSearch.minimum")}</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-500">{t("conversationSearch.failed")}</p>
            </div>
          )}

          {debouncedQuery && !isLoading && results && results.length === 0 && (
            <div className="text-center py-12">
              <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <SearchIcon className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500">{t("conversationSearch.empty", { query: `\u2068${debouncedQuery}\u2069` })}</p>
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                {t("conversationSearch.results", { count: results.length, query: `\u2068${debouncedQuery}\u2069` })}
              </p>
              
              {results.map((result, index) => (
                <Link
                  key={`${result.chatId}-${index}`}
                  href={`/app/inbox/${result.chatId}`}
                  className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-brand-green hover:shadow-md transition-all group"
                  data-testid={`link-search-result-${result.chatId}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-600 font-medium shrink-0">
                      {result.avatar ? (
                        <img src={result.avatar} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <bdi className="font-semibold text-gray-900">{result.chatName}</bdi>
                        {result.tag && (
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full border",
                            TAG_COLORS[result.tag] || "bg-gray-100 text-gray-600 border-gray-200"
                          )}>
                            {result.tag}
                          </span>
                        )}
                        {result.pipelineStage && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                            {result.pipelineStage}
                          </span>
                        )}
                      </div>
                      <p dir="auto" className="text-gray-600 text-sm leading-relaxed line-clamp-2">
                        {highlightMatch(result.matchedText, debouncedQuery)}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        <bdi>{formatRegionalDate(new Date(result.timestamp), i18n.language, { dateStyle: "medium", timeStyle: "short" })}</bdi>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-brand-green transition-colors shrink-0 rtl:rotate-180" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-gray-900 px-0.5 rounded">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}
