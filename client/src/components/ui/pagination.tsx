import { useTranslation } from "react-i18next"
import React, {
  forwardRef,
  type ComponentProps,
} from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { ButtonProps, buttonVariants } from "@/components/ui/button"

const Pagination = ({ className, ...props }: ComponentProps<"nav">) => {
  const { t } = useTranslation()
  return (
    <nav
      role="navigation"
      aria-label={t("common.pagination")}
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}
Pagination.displayName = "Pagination"

const PaginationContent = forwardRef<
  HTMLUListElement,
  ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = forwardRef<
  HTMLLIElement,
  ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<ButtonProps, "size"> &
  ComponentProps<"a">

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      className
    )}
    {...props}
  />
)
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({
  className,
  ...props
}: ComponentProps<typeof PaginationLink>) => {
  const { t } = useTranslation()
  return (
    <PaginationLink
      aria-label={t("common.previousPage")}
      size="default"
      className={cn("gap-1 ps-2.5", className)}
      {...props}
    >
      <ChevronLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
      <span>{t("common.previousPage")}</span>
    </PaginationLink>
  )
}
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  ...props
}: ComponentProps<typeof PaginationLink>) => {
  const { t } = useTranslation()
  return (
    <PaginationLink
      aria-label={t("common.nextPage")}
      size="default"
      className={cn("gap-1 pe-2.5", className)}
      {...props}
    >
      <span>{t("common.nextPage")}</span>
      <ChevronRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
    </PaginationLink>
  )
}
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}: ComponentProps<"span">) => {
  const { t } = useTranslation()
  return (
    <span
      className={cn("flex h-9 w-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal aria-hidden className="h-4 w-4" />
      <span className="sr-only">{t("common.morePages")}</span>
    </span>
  )
}
PaginationEllipsis.displayName = "PaginationEllipsis"

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
