import { useState, useRef, ReactNode, useMemo } from "react";
import { Helmet } from "react-helmet";
import { Search, ChevronRight, HelpCircle, Heart, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCurrentLanguage } from "@/lib/i18n";
import { 
  getHelpArticles, 
  getHelpCategories, 
  getHelpUITranslations,
  type HelpLanguage,
  type HelpArticle
} from "@/lib/helpCenterTranslations";
import { SiteFooter } from "@/components/SiteFooter";
import { MARKETING_URL } from "@/lib/marketingUrl";

function FeedbackSection({ articleId, articleTitle }: { articleId: string; articleTitle: string }) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleYes = () => {
    setFeedback('yes');
    setShowFeedbackForm(false);
  };

  const handleNo = () => {
    setFeedback('no');
    setShowFeedbackForm(true);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return;
    
    setSending(true);
    try {
      await fetch('/api/help-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId,
          articleTitle,
          feedback: feedbackText
        })
      });
    } catch (error) {
      console.error('Error sending feedback:', error);
    }
    setSending(false);
    setSubmitted(true);
    setShowFeedbackForm(false);
  };

  if (feedback === 'yes') {
    return (
      <div className="mt-8 pt-6 border-t border-gray-200 pb-16">
        <div className="flex items-center gap-3 text-pink-500">
          <Heart className="h-8 w-8 fill-current animate-pulse" />
          <span className="text-lg font-medium">Thank you! We're glad it helped.</span>
        </div>
      </div>
    );
  }

  if (feedback === 'no' && submitted) {
    return (
      <div className="mt-8 pt-6 border-t border-gray-200 pb-16">
        <div className="flex items-center gap-3 text-gray-600">
          <Heart className="h-6 w-6 text-brand-green" />
          <span className="text-base font-medium">Thank you for your feedback! We'll work on improving.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 pb-16">
      {!feedback && (
        <>
          <p className="text-sm text-gray-500 mb-2">Was this helpful?</p>
          <div className="flex gap-2">
            <button 
              onClick={handleYes}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-green-100 hover:text-green-700 rounded-lg transition-colors"
            >
              Yes, thanks!
            </button>
            <button 
              onClick={handleNo}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Not really
            </button>
          </div>
        </>
      )}

      {showFeedbackForm && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Oh.. How can we improve?</p>
            <button 
              onClick={() => { setFeedback(null); setShowFeedbackForm(false); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Tell us what was missing or unclear..."
            className="mb-3 resize-none"
            rows={3}
          />
          <button
            onClick={handleSubmitFeedback}
            disabled={sending || !feedbackText.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-green hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      )}
    </div>
  );
}

export function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Get current language for translations
  const currentLang = (getCurrentLanguage() || "en") as HelpLanguage;
  const isRTL = currentLang === "he";
  
  // Get translated content
  const HELP_ARTICLES = useMemo(() => getHelpArticles(currentLang), [currentLang]);
  const CATEGORIES = useMemo(() => getHelpCategories(currentLang), [currentLang]);
  const UI = useMemo(() => getHelpUITranslations(currentLang), [currentLang]);

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  };

  const filteredArticles = HELP_ARTICLES.filter(article => {
    const matchesSearch = searchQuery === "" || 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase())) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = !selectedCategory || article.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const renderMarkdown = (content: string) => {
    const lines = content.trim().split('\n');
    const elements: ReactNode[] = [];
    let inList = false;
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-4 text-gray-600">
            {listItems.map((item, i) => (
              <li key={i}>{item.replace(/^[-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        flushList();
        return;
      }

      if (trimmedLine.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={index} className="text-2xl font-bold text-gray-900 mb-4">
            {trimmedLine.replace('# ', '')}
          </h1>
        );
      } else if (trimmedLine.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={index} className="text-xl font-semibold text-gray-900 mt-6 mb-3">
            {trimmedLine.replace('## ', '')}
          </h2>
        );
      } else if (trimmedLine.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={index} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
            {trimmedLine.replace('### ', '')}
          </h3>
        );
      } else if (trimmedLine.startsWith('FLOW:')) {
        flushList();
        const steps = trimmedLine
          .replace('FLOW:', '')
          .split(/\s*(?:→|>)\s*/)
          .map((step) => step.trim())
          .filter(Boolean);
        elements.push(
          <div key={index} className="my-5 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {steps.map((step, stepIndex) => (
                <div key={`${step}-${stepIndex}`} className="flex items-center gap-2">
                  <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                    {step}
                  </span>
                  {stepIndex < steps.length - 1 && (
                    <ChevronRight className={cn("h-4 w-4 text-gray-300", isRTL && "rotate-180")} />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
        inList = true;
        listItems.push(trimmedLine);
      } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        flushList();
        elements.push(
          <p key={index} className="font-semibold text-gray-800 mt-4 mb-1">
            {trimmedLine.replace(/\*\*/g, '')}
          </p>
        );
      } else {
        flushList();
        const formatted = trimmedLine
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>');
        elements.push(
          <p key={index} className="text-gray-600 mb-3" dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="flex flex-col min-h-screen bg-white" dir={isRTL ? "rtl" : "ltr"}>
      <Helmet>
        <title>{UI.title} | WhachatCRM</title>
        <link rel="canonical" href={`${MARKETING_URL}/help`} />
        <meta property="og:url" content={`${MARKETING_URL}/help`} />
      </Helmet>

      <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50 shrink-0">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">{UI.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{UI.subtitle}</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 relative" ref={contentRef}>
        <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-48">
          {!selectedArticle ? (
            <div>
              <div className="relative mb-6">
                <Search className={cn("absolute top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400", isRTL ? "right-3" : "left-3")} />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={UI.searchPlaceholder}
                  className={cn("h-12 text-base", isRTL ? "pr-10" : "pl-10")}
                  data-testid="input-search-help"
                />
              </div>

              {!searchQuery && !selectedCategory && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => { setSelectedCategory(cat.name); scrollToTop(); }}
                      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:border-brand-green hover:bg-green-50/50 transition-colors text-center"
                      data-testid={`button-category-${cat.name.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <cat.icon className="h-5 w-5 text-gray-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedCategory && (
                <div className={cn("mb-4 flex items-center gap-2", isRTL && "flex-row-reverse")}>
                  <button
                    onClick={() => { setSelectedCategory(null); scrollToTop(); }}
                    className="text-sm text-brand-green hover:underline"
                  >
                    {UI.allCategories}
                  </button>
                  <ChevronRight className={cn("h-4 w-4 text-gray-400", isRTL && "rotate-180")} />
                  <span className="text-sm font-medium text-gray-700">{selectedCategory}</span>
                </div>
              )}

              <div className="space-y-2">
                {filteredArticles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => { setSelectedArticle(article); scrollToTop(); }}
                    className={cn("w-full flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-brand-green hover:bg-green-50/30 transition-colors", isRTL ? "flex-row-reverse text-right" : "text-left")}
                    data-testid={`button-article-${article.id}`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <article.icon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900">{article.title}</h3>
                      <p className="text-sm text-gray-500">{article.category}</p>
                    </div>
                    <ChevronRight className={cn("h-5 w-5 text-gray-400 shrink-0", isRTL && "rotate-180")} />
                  </button>
                ))}

                {filteredArticles.length === 0 && (
                  <div className="text-center py-12">
                    <HelpCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">{UI.noArticlesFound}</h3>
                    <p className="text-gray-500">{UI.noArticlesHint}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <button
                onClick={() => { setSelectedArticle(null); scrollToTop(); }}
                className={cn("flex items-center gap-1 text-sm text-brand-green hover:underline mb-6", isRTL && "flex-row-reverse")}
                data-testid="button-back-to-articles"
              >
                <ChevronRight className={cn("h-4 w-4", isRTL ? "" : "rotate-180")} />
                {UI.backToHelpCenter}
              </button>

              <div className={cn("flex items-center gap-2 text-sm text-gray-500 mb-4", isRTL && "flex-row-reverse")}>
                <span>{selectedArticle.category}</span>
              </div>

              <article className="prose prose-gray max-w-none">
                {renderMarkdown(selectedArticle.content)}
              </article>

              <FeedbackSection articleId={selectedArticle.id} articleTitle={selectedArticle.title} />
            </div>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
