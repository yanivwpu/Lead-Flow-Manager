import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  emailsMatchForAdminDeletion,
  type AdminAccountDeletionBlocker,
} from "@shared/adminAccountDeletion";

const ADMIN_TOKEN_KEY = "whachat_admin_token";

function adminFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(token ? { "x-admin-token": token } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

type PreflightResponse = {
  allowed: boolean;
  userId: string | null;
  name: string | null;
  email: string | null;
  blockers: AdminAccountDeletionBlocker[];
  error?: string;
};

type Props = {
  user: { id: string; name: string | null; email: string };
  onDeleted: () => void;
};

export function AdminUserPermanentDeleteButton({ user, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const deletingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPreflight(null);
    setEmailConfirmation("");
    void (async () => {
      try {
        const res = await adminFetch(`/api/admin/users/${user.id}/deletion-preflight`);
        const data = (await res.json().catch(() => ({}))) as PreflightResponse;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || `Failed to load deletion checks (${res.status})`);
          return;
        }
        setPreflight(data);
      } catch {
        if (!cancelled) setLoadError("Failed to load deletion checks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user.id]);

  const displayName = preflight?.name || user.name || "No name";
  const displayEmail = preflight?.email || user.email;
  const emailMatches = emailsMatchForAdminDeletion(displayEmail, emailConfirmation);
  const blocked = !!preflight && !preflight.allowed;
  const eligible = !!preflight && preflight.allowed;

  async function confirmDelete() {
    if (deletingRef.current || deleting || !eligible || !emailMatches) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailConfirmation }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        blockers?: AdminAccountDeletionBlocker[];
        success?: boolean;
      };
      if (!res.ok) {
        if (data.blockers?.length) {
          setPreflight({
            allowed: false,
            userId: user.id,
            name: displayName,
            email: displayEmail,
            blockers: data.blockers,
          });
        }
        toast({
          title: "Account was not deleted",
          description: data.error || "Permanent deletion was blocked.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Account permanently deleted",
        description: "The unused empty account was removed.",
      });
      setOpen(false);
      onDeleted();
    } catch {
      toast({
        title: "Account was not deleted",
        description: "Permanent deletion failed. Try again.",
        variant: "destructive",
      });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-500 hover:text-red-600"
        aria-label={`Delete ${user.email}`}
        data-testid={`admin-user-delete-${user.id}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (deleting) return;
          setOpen(next);
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] w-[calc(100%-1.25rem)] max-w-[520px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b px-4 pb-2 pt-3 text-left sm:px-5 sm:pb-2.5 sm:pt-4">
            <DialogTitle>
              {blocked ? "This account cannot be deleted" : "Permanently delete account"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking whether this unused account can be deleted…
              </div>
            ) : loadError ? (
              <p className="text-sm text-red-600">{loadError}</p>
            ) : blocked ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Permanent deletion is only allowed for empty unused accounts. This account is blocked:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                  {(preflight?.blockers || []).map((b) => (
                    <li key={b.code}>
                      {b.label}
                      {typeof b.count === "number" ? ` (${b.count})` : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500">
                  Stripe, Shopify, connected channels, and customer data are never cancelled or uninstalled from here.
                </p>
              </div>
            ) : eligible ? (
              <div className="space-y-3">
                <p className="text-sm text-red-700 font-medium">
                  This permanently deletes the account. This cannot be undone.
                </p>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">{displayName}</div>
                  <div className="text-gray-600">{displayEmail}</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`admin-delete-email-${user.id}`}>
                    Type the account email to confirm
                  </Label>
                  <Input
                    id={`admin-delete-email-${user.id}`}
                    type="email"
                    autoComplete="off"
                    value={emailConfirmation}
                    onChange={(e) => setEmailConfirmation(e.target.value)}
                    placeholder={displayEmail}
                    disabled={deleting}
                    data-testid="admin-user-delete-email-confirm"
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 flex flex-row flex-wrap items-center justify-end gap-2 border-t px-4 py-2.5 sm:px-5">
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setOpen(false)}
            >
              {blocked || loadError ? "Close" : "Cancel"}
            </Button>
            {eligible && (
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || !emailMatches}
                onClick={() => void confirmDelete()}
                data-testid="admin-user-delete-confirm"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Permanently delete"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
