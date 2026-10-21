import { safeTextLinks } from "@shared/safeTextLinks";
export function SafeMessageText({ text }: { text: string }) {
  return <>{safeTextLinks(text, true).map((part, index) => part.href
    ? <a key={index} href={part.href} className="underline" target="_blank" rel="noopener noreferrer">{part.text}</a>
    : <span key={index}>{part.text}</span>)}</>;
}
