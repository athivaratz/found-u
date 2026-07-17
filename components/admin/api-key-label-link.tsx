import { ExternalLink } from "lucide-react";

type ApiKeyLabelLinkProps = {
  htmlFor?: string;
  label: string;
  href: string;
  ariaLabel: string;
  className?: string;
};

export function ApiKeyLabelLink({
  htmlFor,
  label,
  href,
  ariaLabel,
  className = "block text-sm font-medium mb-1",
}: ApiKeyLabelLinkProps) {
  return (
    <label htmlFor={htmlFor} className={`flex items-center gap-1.5 ${className}`}>
      <span>{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className="text-primary hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </label>
  );
}
