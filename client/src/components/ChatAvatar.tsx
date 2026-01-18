import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ChatAvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function isImageUrl(src?: string | null): boolean {
  if (!src) return false;
  return (
    src.startsWith("http") ||
    src.startsWith("/") ||
    src.includes(".jpg") ||
    src.includes(".jpeg") ||
    src.includes(".png") ||
    src.includes(".gif") ||
    src.includes(".webp") ||
    src.includes("attached_assets") ||
    src.startsWith("data:image/")
  );
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-11 w-11 text-sm",
};

export function ChatAvatar({ src, name, size = "md", className }: ChatAvatarProps) {
  const initials = getInitials(name);
  const hasImage = isImageUrl(src);

  return (
    <Avatar className={cn(sizeClasses[size], "shrink-0", className)}>
      {hasImage && (
        <AvatarImage
          src={src!}
          alt={name}
          className="object-cover"
        />
      )}
      <AvatarFallback className="bg-brand-green/10 text-brand-green font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
