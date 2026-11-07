"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui-kit";
import { useEvents } from "@/hooks/use-events";
import { ALL, Panel } from "@/features/security/shared";

// ---------- localStorage-backed prefs (per browser, not per account) ----------
const listeners = new Set<() => void>();
function useLocal(key: string, fallback: string) {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => localStorage.getItem(key) ?? fallback,
    () => fallback,
  );
  const set = (v: string) => {
    localStorage.setItem(key, v);
    listeners.forEach((l) => l());
  };
  return [value, set] as const;
}

export const NOTIFY_KEYS = { security: "notify.security_alerts", approvals: "notify.approvals" } as const;
const notifyOn = (k: keyof typeof NOTIFY_KEYS) => typeof window !== "undefined" && localStorage.getItem(NOTIFY_KEYS[k]) !== "0";

/**
 * Toasts for live security alerts / approval requests, honouring the Notifications prefs.
 * Mount once in the authenticated shell: `useEventToasts()`.
 */
export function useEventToasts() {
  const { events } = useEvents();
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const newest = events[0]?.id;
    if (newest === undefined) return;
    if (seen.current === null) {
      seen.current = newest; // do not replay history on first load
      return;
    }
    for (const e of events.filter((x) => x.id > seen.current!).reverse()) {
      if (e.type === "security.alert" && notifyOn("security")) toast.warning(e.summary, { description: "Security alert" });
      if (e.type === "approval.requested" && notifyOn("approvals")) toast.info(e.summary, { description: "Approval requested" });
    }
    seen.current = newest;
  }, [events]);
}

function Pill({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <StatusBadge status={ok ? "SUCCEEDED" : "DISABLED"} label={ok ? yes : no} />;
}

// ---------- Voice ----------
export function VoiceTab() {
  const [support, setSupport] = useState<{ stt: boolean; tts: boolean } | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useLocal("voice.name", "");
  const [rate, setRate] = useLocal("voice.rate", "1");

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const tts = "speechSynthesis" in window;
    // Browser capability is only known client-side, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport({ stt: !!(w.SpeechRecognition || w.webkitSpeechRecognition), tts });
    if (!tts) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const test = () => {
    const u = new SpeechSynthesisUtterance("Hello, I am the TECHX sales assistant. How can I help you today?");
    const v = voices.find((x) => x.name === voiceName);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = Number(rate) || 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Browser support">
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              {support?.stt ? <Mic aria-hidden className="size-4" /> : <MicOff aria-hidden className="size-4" />} Speech recognition (customer voice input)
            </span>
            {support ? <Pill ok={support.stt} yes="Available" no="Unavailable" /> : <span className="text-muted-foreground">Checking...</span>}
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              {support?.tts ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />} Speech synthesis (agent voice)
            </span>
            {support ? <Pill ok={support.tts} yes="Available" no="Unavailable" /> : <span className="text-muted-foreground">Checking...</span>}
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Voice runs entirely in the browser. Audio never leaves the device; only the transcribed text is sent, and only after the
          customer consents. Speech recognition works best in Chrome or Edge.
        </p>
      </Panel>
      <Panel title="Agent voice">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="voice-name">Voice</Label>
            <Select value={voiceName || ALL} onValueChange={(v) => setVoiceName(v === ALL ? "" : v)} disabled={!support?.tts}>
              <SelectTrigger id="voice-name" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Browser default</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.voiceURI} value={v.name}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voice-rate">
              Rate <span className="num text-muted-foreground">{Number(rate).toFixed(1)}x</span>
            </Label>
            <input
              id="voice-rate"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full accent-[var(--info)]"
            />
          </div>
          <Button variant="outline" onClick={test} disabled={!support?.tts}>
            <Volume2 aria-hidden /> Test voice
          </Button>
          <p className="text-xs text-muted-foreground">Saved in this browser (localStorage keys voice.name and voice.rate).</p>
        </div>
      </Panel>
    </div>
  );
}

// ---------- Notifications ----------
export function NotificationsTab() {
  const [sec, setSec] = useLocal(NOTIFY_KEYS.security, "1");
  const [appr, setAppr] = useLocal(NOTIFY_KEYS.approvals, "1");
  const rows = [
    { id: "n-sec", label: "Security alerts", desc: "Toast when a fraud, injection or agent violation event is raised.", v: sec, set: setSec },
    { id: "n-appr", label: "Approval requests", desc: "Toast when an agent or user asks for a human decision.", v: appr, set: setAppr },
  ];
  return (
    <Panel title="Live notifications" className="max-w-2xl">
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <Label htmlFor={r.id} className="font-medium">
                {r.label}
              </Label>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </div>
            <Switch id={r.id} checked={r.v !== "0"} onCheckedChange={(c) => r.set(c ? "1" : "0")} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Preferences are stored in this browser only.</p>
    </Panel>
  );
}
