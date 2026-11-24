import { useTranslation } from "react-i18next";
import { Component, type ReactNode } from "react";

function PageError({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="p-6" data-testid="authenticated-page-error">
      <p className="text-sm text-gray-800" role="alert">{t("common.pageError")}</p>
      <button
        type="button"
        className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
        data-testid="button-authenticated-page-retry"
        onClick={retry}
      >
        {t("common.tryAgain")}
      </button>
    </div>
  );
}

type BoundaryState = { hasError: boolean };

/**
 * Keeps the authenticated app shell mounted if a page render throws
 * (e.g. a non-string logoUrl). Does not hide the original error.
 */
export class AuthenticatedAppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[AuthenticatedApp] render error", error?.name || "Error");
  }

  render() {
    if (this.state.hasError) {
      return <PageError retry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
