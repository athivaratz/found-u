// The widget writes a hidden input. Chat, login, and the AI posts read it.
// The site key comes from GET /api/public-config, not from the build.

export function readTurnstileToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const input = document.querySelector<HTMLInputElement>(
    'input[name="cf-turnstile-response"]'
  );
  const value = input?.value?.trim();
  return value ? value : undefined;
}

export function turnstileHeader(): Record<string, string> {
  const token = readTurnstileToken();
  return token ? { "X-Turnstile-Token": token } : {};
}
