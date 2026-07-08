"use client";

import { SetupWizard, type SetupWizardInitialState } from "./setup-wizard";

type SetupPageClientProps = {
  initialState: SetupWizardInitialState;
};

export function SetupPageClient({ initialState }: SetupPageClientProps) {
  return <SetupWizard {...initialState} />;
}
