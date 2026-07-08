"use client";

import { useEffect, useState } from "react";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import InfoTooltip from "@/components/ui/info-tooltip";
import {
  WIZARD_FREE_OPENROUTER_MODELS,
  type WizardAiConfigInput,
} from "@/lib/setup/validations/wizard-ai";
import { testAiCredentialsAction } from "@/app/setup/actions";

export type AiDraft = WizardAiConfigInput;

type StepAiConfigProps = {
  initial: AiDraft;
  onChange: (draft: AiDraft) => void;
  onSkip: () => void;
  error?: string | null;
  isSubmitting?: boolean;
};

type AiProviderTab = "auto" | "gemini" | "openrouter";

export function StepAiConfig({
  initial,
  onChange,
  onSkip,
  error,
  isSubmitting,
}: StepAiConfigProps) {
  const [draft, setDraft] = useState<AiDraft>(initial);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    onChange(draft);
  }, [draft, onChange]);

  function update<K extends keyof AiDraft>(key: K, value: AiDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setTestMessage(null);
    setTestError(null);
  }

  async function handleTest() {
    if (draft.provider === "none") return;
    setTesting(true);
    setTestMessage(null);
    setTestError(null);
    const result = await testAiCredentialsAction({
      provider: draft.provider as AiProviderTab,
      geminiApiKey: draft.geminiApiKey,
      openrouterApiKey: draft.openrouterApiKey,
      openrouterModel: draft.openrouterModel,
    });
    setTesting(false);
    if (result.ok) {
      setTestMessage("เชื่อมต่อสำเร็จ");
    } else {
      setTestError(result.error);
    }
  }

  const showGemini = draft.provider === "auto" || draft.provider === "gemini";
  const showOpenRouter = draft.provider === "auto" || draft.provider === "openrouter";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-text-primary">ตั้งค่า AI (ไม่บังคับ)</h2>
        <InfoTooltip content="ใช้ free tier ได้ — ตั้งทีหลังในแผงแอดมินก็ได้" />
      </div>

      <SegmentedTabs<AiProviderTab>
        value={(draft.provider === "none" ? "auto" : draft.provider) as AiProviderTab}
        onChange={(value) => update("provider", value)}
        items={[
          { id: "auto", label: "Auto" },
          { id: "gemini", label: "Gemini" },
          { id: "openrouter", label: "OpenRouter" },
        ]}
      />

      {showGemini ? (
        <div>
          <label className="block text-sm font-medium mb-1">Gemini API Key</label>
          <input
            type="password"
            value={draft.geminiApiKey ?? ""}
            onChange={(e) => update("geminiApiKey", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border-light font-mono text-sm"
            placeholder="AIza..."
            autoComplete="off"
          />
        </div>
      ) : null}

      {showOpenRouter ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">OpenRouter API Key</label>
            <input
              type="password"
              value={draft.openrouterApiKey ?? ""}
              onChange={(e) => update("openrouterApiKey", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border-light font-mono text-sm"
              placeholder="sk-or-..."
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">โมเดล (free tier)</label>
            <select
              value={draft.openrouterModel ?? WIZARD_FREE_OPENROUTER_MODELS[0]}
              onChange={(e) => update("openrouterModel", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border-light text-sm"
            >
              {WIZARD_FREE_OPENROUTER_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <div className="rounded-xl border border-border-light bg-bg-secondary p-3 text-xs text-text-secondary space-y-1">
        <p>รับ API key ฟรีได้ที่ Google AI Studio และ OpenRouter</p>
        <p>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            Google AI Studio
          </a>
          {" · "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            OpenRouter
          </a>
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleTest()}
        disabled={testing || isSubmitting || draft.provider === "none"}
        className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
      >
        {testing ? "กำลังทดสอบ..." : "ทดสอบการเชื่อมต่อ"}
      </button>
      {testMessage ? <p className="text-sm text-line-green">{testMessage}</p> : null}
      {testError ? <p className="text-sm text-destructive">{testError}</p> : null}

      <button
        type="button"
        onClick={onSkip}
        disabled={isSubmitting}
        className="text-sm text-text-secondary hover:text-text-primary underline disabled:opacity-50"
      >
        ข้ามขั้นตอนนี้
      </button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
