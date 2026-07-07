"use client";

import { HelpCircle } from "lucide-react";
import {
  AI_SETTING_HELP,
  formatEffectiveHint,
} from "@/lib/admin/ai-setting-help";
import type { AppSettings } from "@/lib/types";

type AiSettingFieldProps = {
  settingKey: string;
  label?: string;
  children: React.ReactNode;
  settings?: AppSettings;
};

export function AiSettingField({
  settingKey,
  label,
  children,
  settings,
}: AiSettingFieldProps) {
  const help = AI_SETTING_HELP[settingKey];
  const effective = settings ? formatEffectiveHint(settingKey, settings) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <label className="text-sm font-medium text-gray-900 dark:text-white">
          {label ?? help?.label ?? settingKey}
        </label>
        {help ? (
          <span className="group relative">
            <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
            <span className="pointer-events-none absolute z-20 left-0 top-6 hidden group-hover:block w-72 rounded-xl bg-gray-900 text-white text-xs p-3 shadow-lg">
              <span className="block font-semibold mb-1">{help.description}</span>
              <span className="block text-gray-300">ใช้เมื่อ: {help.whenToUse}</span>
              <span className="block mt-1 text-[#06C755]">แนะนำ: {help.recommended}</span>
            </span>
          </span>
        ) : null}
      </div>
      {help ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{help.description}</p>
      ) : null}
      {effective ? (
        <p className="text-xs text-violet-600 dark:text-violet-400">{effective}</p>
      ) : null}
      {children}
    </div>
  );
}
