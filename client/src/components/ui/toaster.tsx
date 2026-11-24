import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "@/hooks/use-toast"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  const { t, i18n } = useTranslation()
  useEffect(() => {
    const showLocaleError = () => toast({ description: t("language.loadFailed"), variant: "destructive" })
    window.addEventListener("whachatcrm:locale-load-failed", showLocaleError)
    return () => window.removeEventListener("whachatcrm:locale-load-failed", showLocaleError)
  }, [t])

  return (
    <ToastProvider label={t("common.toastNotifications")} swipeDirection={i18n.dir() === "rtl" ? "left" : "right"}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose aria-label={t("common.close")} />
          </Toast>
        )
      })}
      <ToastViewport label={`${t("common.toastNotifications")} ({hotkey})`} />
    </ToastProvider>
  )
}
