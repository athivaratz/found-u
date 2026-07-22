"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ChatProvider, useAutoTitle, useChatContext } from "@/contexts/chat-context";
import { AgentTopBar } from "@/components/agent/agent-top-bar";
import { AgentEmptyState } from "@/components/agent/agent-empty-state";
import { AgentMessageList } from "@/components/agent/agent-message-list";
import { AgentComposer } from "@/components/agent/agent-composer";
import { ClassicQuickLinks } from "@/components/agent/classic-quick-links";
import { TraditionalFallbackPanel } from "@/components/agent/traditional-fallback-panel";
import { VoiceSphereOverlay } from "@/components/agent/voice-sphere-overlay";
import { ChatSidebar } from "@/components/agent/chat-sidebar";
import { LocationPermissionGate } from "@/components/shared/location-permission-gate";
import { useFoundLocationGate } from "@/hooks/use-found-location-gate";
import {
  assistantAskedForFoundDetails,
  findLatestFoundLocationBlock,
  isFoundReportPrompt,
  isLostReportPrompt,
  isNonFoundPivotPrompt,
} from "@/lib/agent/found-location-client";
import { thaiCopy } from "@/lib/copy/thai-student";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import { AUTH_ROUTES } from "@/lib/auth-routes";

function AgentChatInner() {
  const { user, loading: authLoading, appSettings, appSettingsReady, isAdmin } =
    useAuth();
  const mounted = useMounted();
  const [input, setInput] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const pendingFoundPromptRef = useRef<string | null>(null);
  const lastBlockKeyRef = useRef<string | null>(null);
  /** Sticky: once user starts a found-report flow, require GPS until verified. */
  const [foundFlowNeedsGps, setFoundFlowNeedsGps] = useState(false);

  const {
    messages,
    status,
    fallback,
    droppedCount,
    storageWarning,
    setSidebarOpen,
    createSession,
    sendPrompt,
    clearFallback,
    isThinking,
    loading: chatLoading,
    activeSessionId,
    setClientLocation,
    setAdminLocationBypass,
  } = useChatContext();

  useAutoTitle(messages, activeSessionId);

  const locationGate = useFoundLocationGate({
    appSettings,
    appSettingsReady,
    enabled: Boolean(user) && mounted,
    mode: "lazy",
    isAdmin,
    onVerifiedCoords: (coords) => {
      setAdminLocationBypass(false);
      setClientLocation(coords);
    },
  });

  const {
    gpsLoading,
    locationVerified,
    locationErrorType,
    userCurrentCoords,
    verifiedCoords,
    adminGpsBypassed,
    enforcementRequired,
    polygon,
    showLazyGate,
    openGate,
    closeGate,
    openGateForLocationFailure,
    retryPermission,
    bypassAsAdmin,
  } = locationGate;

  // Keep chat body location in sync (clear when not verified under enforcement)
  useEffect(() => {
    if (adminGpsBypassed) {
      setAdminLocationBypass(true);
      setFoundFlowNeedsGps(false);
      return;
    }
    setAdminLocationBypass(false);

    if (!enforcementRequired) {
      if (verifiedCoords) setClientLocation(verifiedCoords);
      setFoundFlowNeedsGps(false);
      return;
    }
    if (locationVerified === true && verifiedCoords) {
      setClientLocation(verifiedCoords);
      setFoundFlowNeedsGps(false);
    } else {
      setClientLocation(null);
    }
  }, [
    enforcementRequired,
    adminGpsBypassed,
    locationVerified,
    verifiedCoords,
    setClientLocation,
    setAdminLocationBypass,
  ]);

  // After location succeeds with a pending found prompt — send it
  useEffect(() => {
    if (locationVerified !== true && !adminGpsBypassed) return;
    const pending = pendingFoundPromptRef.current;
    if (!pending) return;
    pendingFoundPromptRef.current = null;
    setFoundFlowNeedsGps(false);
    closeGate();
    sendPrompt(pending);
  }, [locationVerified, adminGpsBypassed, closeGate, sendPrompt]);

  // Open lazy gate when reportFoundItem fails on location (once per failure)
  useEffect(() => {
    if (!enforcementRequired) return;
    if (status === "streaming" || status === "submitted") return;
    const block = findLatestFoundLocationBlock(messages);
    if (!block) return;
    const key = `${messages.length}:${block.locationCode}:${block.message}`;
    if (lastBlockKeyRef.current === key) return;
    lastBlockKeyRef.current = key;
    setFoundFlowNeedsGps(true);
    openGateForLocationFailure();
  }, [messages, status, enforcementRequired, openGateForLocationFailure]);

  // If assistant already asked for found details without GPS, lock the flow
  useEffect(() => {
    if (!enforcementRequired || adminGpsBypassed) return;
    if (locationVerified === true) return;
    if (assistantAskedForFoundDetails(messages)) {
      setFoundFlowNeedsGps(true);
    }
  }, [
    messages,
    enforcementRequired,
    adminGpsBypassed,
    locationVerified,
  ]);

  const needsFoundGpsGate =
    enforcementRequired &&
    !adminGpsBypassed &&
    locationVerified !== true;

  const sendOrGateFound = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (isLostReportPrompt(trimmed) || isNonFoundPivotPrompt(trimmed)) {
      setFoundFlowNeedsGps(false);
      pendingFoundPromptRef.current = null;
      sendPrompt(trimmed);
      return;
    }

    const isFoundStart = isFoundReportPrompt(trimmed);
    const isFoundFollowUp =
      foundFlowNeedsGps || assistantAskedForFoundDetails(messages);

    if (needsFoundGpsGate && (isFoundStart || isFoundFollowUp)) {
      setFoundFlowNeedsGps(true);
      pendingFoundPromptRef.current = trimmed;
      openGate();
      return;
    }

    sendPrompt(trimmed);
  };

  if ((authLoading && !user) || !mounted) {
    return (
      <div
        className="h-full flex-1 flex items-center justify-center agent-surface-bg min-h-0"
        role="status"
        aria-label="กำลังโหลด"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-green border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full flex-1 flex flex-col agent-surface-bg min-h-0">
        <AgentTopBar />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="mb-5 max-w-sm text-pretty text-base leading-[1.5] text-text-secondary">
            {thaiCopy.agent.loginRequired}
          </p>
          <Link
            href={AUTH_ROUTES.hub}
            className="min-h-11 rounded-full bg-line-green-cta px-8 py-3 font-medium text-white transition-colors hover:bg-line-green-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-green/40 focus-visible:ring-offset-2 touch-manipulation"
          >
            เข้าสู่ระบบ
          </Link>
          <ClassicQuickLinks className="mt-8" />
        </div>
      </div>
    );
  }

  if (chatLoading) {
    return (
      <div
        className="h-full flex-1 flex items-center justify-center agent-surface-bg min-h-0"
        role="status"
        aria-label="กำลังโหลดแชท"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-green border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }

  const onSubmit = () => {
    sendOrGateFound(input);
    setInput("");
  };

  const locationBlockedBanner = findLatestFoundLocationBlock(messages);
  const showGpsBanner =
    needsFoundGpsGate &&
    (foundFlowNeedsGps || Boolean(locationBlockedBanner));

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 w-full min-w-0",
        "assistant-desktop:rounded-2xl assistant-desktop:border assistant-desktop:border-border-light",
        "assistant-desktop:overflow-hidden assistant-desktop:bg-bg-primary assistant-desktop:shadow-card"
      )}
    >
      <ChatSidebar variant="inline" />
      <ChatSidebar variant="drawer" />

      <div className="flex flex-col min-h-0 min-w-0 flex-1 overflow-x-hidden agent-surface-bg agent-chat-pane assistant-desktop:bg-bg-primary">
        <AgentTopBar
          status={status}
          onNewChat={() => {
            setFoundFlowNeedsGps(false);
            pendingFoundPromptRef.current = null;
            void createSession();
          }}
          onOpenHistory={() => setSidebarOpen(true)}
        />

        {droppedCount > 0 ? (
          <div
            className="mx-4 mt-2 feedback-panel feedback-panel--info text-xs text-text-secondary shrink-0"
            role="status"
          >
            แชทยาว — จำเฉพาะข้อความล่าสุด ({droppedCount} ข้อความเก่าไม่ส่งให้ผู้ช่วย)
          </div>
        ) : null}

        {storageWarning ? (
          <div
            className="mx-4 mt-2 feedback-panel feedback-panel--warning text-xs text-text-primary shrink-0"
            role="status"
          >
            {storageWarning}
          </div>
        ) : null}

        {messages.length === 0 && !fallback ? (
          <AgentEmptyState
            className="flex-1 min-h-0"
            onSelectPrompt={sendOrGateFound}
          />
        ) : (
          <AgentMessageList messages={messages} status={status} />
        )}

        {fallback ? (
          <TraditionalFallbackPanel payload={fallback} className="mx-4 mb-2" />
        ) : null}

        {showGpsBanner ? (
          <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-status-warning/30 bg-status-warning-light px-3 py-2 text-sm text-text-primary shrink-0">
            <MapPin className="w-4 h-4 text-status-warning shrink-0" aria-hidden />
            <span className="flex-1 min-w-0 text-pretty text-xs sm:text-sm">
              ต้องยืนยันตำแหน่งในโรงเรียนก่อนแจ้งเจอของ — ยังคุยเรื่องอื่นหรือแจ้งของหายได้ตามปกติ
            </span>
            <button
              type="button"
              onClick={() => void retryPermission()}
              className="min-h-9 rounded-full bg-line-green px-3 py-1.5 text-xs font-medium text-white hover:bg-line-green-hover touch-manipulation"
            >
              ขอสิทธิ์ตำแหน่งอีกครั้ง
            </button>
          </div>
        ) : null}

        {messages.length > 0 ? (
          <ClassicQuickLinks
            className="px-4 pb-2 shrink-0 w-full max-w-full min-w-0"
            onAgentPrompt={sendOrGateFound}
          />
        ) : null}

        <AgentComposer
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          onVoiceClick={() => !isThinking && setVoiceOpen(true)}
          disabled={isThinking}
          className="shrink-0 w-full max-w-full min-w-0"
        />

        <VoiceSphereOverlay
          open={voiceOpen && !isThinking}
          onClose={() => setVoiceOpen(false)}
          onTranscript={(text) => {
            clearFallback();
            setVoiceOpen(false);
            sendOrGateFound(text);
          }}
        />

        <LocationPermissionGate
          open={showLazyGate}
          onClose={closeGate}
          waitingForSettings={Boolean(user) && !appSettingsReady}
          gpsLoading={gpsLoading}
          locationVerified={locationVerified}
          locationErrorType={locationErrorType}
          userCurrentCoords={userCurrentCoords}
          appSettings={appSettings}
          schoolPolygon={polygon}
          isAdmin={isAdmin}
          onRetry={() => void retryPermission()}
          onAdminBypass={bypassAsAdmin}
          dismissLabel="ปิดแล้วคุยต่อ"
          onDismiss={() => {
            // Keep sticky GPS requirement; do not send the found prompt yet.
            pendingFoundPromptRef.current = null;
            setFoundFlowNeedsGps(true);
            closeGate();
          }}
          closeOnBackdrop
          showCloseButton
        />
      </div>
    </div>
  );
}

export function AgentChatShell() {
  return (
    <ChatProvider>
      <div className="flex flex-1 flex-col min-h-0 h-full overflow-hidden">
        <AgentChatInner />
      </div>
    </ChatProvider>
  );
}
