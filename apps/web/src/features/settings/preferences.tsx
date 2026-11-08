"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Eyebrow, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { useTrackifyTheme } from "@/components/theme";
import { useEvents } from "@/hooks/use-events";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ALL } from "@/features/security/shared";

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
const DENSITY_KEY = "trackify-density";
const MOTION_KEY = "trackify-reduce-motion";
const VOICE_OUT_KEY = "assistant.voiceOut"; // read by the public assistant (features/assistant/chat.tsx)

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

/** Density + reduced motion are browser prefs applied as <html> data attributes. Mounted by the Preferences tab. */
function useAppearancePrefs() {
  const [density, setDensity] = useLocal(DENSITY_KEY, "comfortable");
  const [motion, setMotion] = useLocal(MOTION_KEY, "0");
  useEffect(() => {
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.reduceMotion = motion === "1" ? "true" : "";
  }, [density, motion]);
  return { density, setDensity, reduceMotion: motion === "1", setReduceMotion: (v: boolean) => setMotion(v ? "1" : "0") };
}

function Toggle({ id, label, desc, checked, onChange }: { id: string; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-hair pt-3.5">
      <label htmlFor={id} className="flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block text-[12.5px] text-t3">{desc}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function PreferencesTab() {
  const { theme, toggle } = useTrackifyTheme();
  const { data: me } = useMe();
  const { density, setDensity, reduceMotion, setReduceMotion } = useAppearancePrefs();
  const [sec, setSec] = useLocal(NOTIFY_KEYS.security, "1");
  const [appr, setAppr] = useLocal(NOTIFY_KEYS.approvals, "1");
  const [voiceOut, setVoiceOut] = useLocal(VOICE_OUT_KEY, "0");

  return (
    <>
      {/* ponytail: the attributes above only have an effect through these rules; move them to globals.css when the foundation owner agrees. */}
      <style>{`html[data-density="compact"]{font-size:14px}html[data-reduce-motion="true"] *,html[data-reduce-motion="true"] *::before,html[data-reduce-motion="true"] *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}`}</style>
      <div className="border-b border-hair px-5 py-[18px]">
        <h3 className="text-base font-extrabold">Preferences</h3>
        <p className="mt-0.5 text-[13px] text-t3">Appearance and notifications for this account.</p>
      </div>
      <div className="grid gap-[18px] px-5 py-[18px]">
        <div>
          <Eyebrow>Appearance</Eyebrow>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border border-hair bg-panel2 p-[3px]" role="group" aria-label="Theme">
              {(
                [
                  ["dark", "Dark", Moon],
                  ["light", "Light", Sun],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={theme === k}
                  onClick={(e) => theme !== k && toggle(e)}
                  className={cn("inline-flex h-[34px] items-center gap-[7px] rounded-[9px] px-3.5 text-[13px] font-bold transition-colors", theme === k ? "bg-text text-bg" : "text-t2 hover:text-text")}
                >
                  <Icon aria-hidden className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-xl border border-hair bg-panel2 p-[3px]" role="group" aria-label="Density">
              {(["comfortable", "compact"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={density === k} onClick={() => setDensity(k)} className={cn("h-[34px] rounded-[9px] px-3.5 text-[13px] font-bold capitalize transition-colors", density === k ? "bg-text text-bg" : "text-t2 hover:text-text")}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Toggle id="p-toasts-sec" label="Event toasts · security" desc="Show a toast when a fraud, injection or agent violation alert is raised." checked={sec !== "0"} onChange={(c) => setSec(c ? "1" : "0")} />
        <Toggle id="p-toasts-appr" label="Event toasts · approvals" desc="Show a toast when an agent or user asks for a human decision." checked={appr !== "0"} onChange={(c) => setAppr(c ? "1" : "0")} />
        <Toggle id="p-voice" label="Read replies aloud" desc="Browser speech synthesis for the assistant preview." checked={voiceOut === "1"} onChange={(c) => setVoiceOut(c ? "1" : "0")} />
        <Toggle id="p-motion" label="Reduced motion" desc="Disable animations in this browser (the system setting is always honoured)." checked={reduceMotion} onChange={setReduceMotion} />
        <VoiceBlock />
        {me && (
          <div className="border-t border-hair pt-3.5">
            <Eyebrow>Your account</Eyebrow>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-t3">Name</dt>
              <dd className="font-semibold">{me.full_name}</dd>
              <dt className="text-t3">Email</dt>
              <dd className="num text-xs">{me.email}</dd>
              <dt className="text-t3">Roles</dt>
              <dd className="flex flex-wrap gap-1">
                {me.roles.map((r) => (
                  <span key={r} className="num rounded-md border border-hair bg-panel2 px-1.5 py-0.5 text-[11px]">
                    {r}
                  </span>
                ))}
              </dd>
              <dt className="text-t3">Status</dt>
              <dd>
                <StatusBadge status={me.is_active ? "SUCCEEDED" : "DISABLED"} label={me.is_active ? "Active" : "Inactive"} />
              </dd>
              <dt className="text-t3">Last login</dt>
              <dd>
                <TimeAgo date={me.last_login_at} />
              </dd>
              <dt className="text-t3">Permissions</dt>
              <dd className="num">{me.permissions.length}</dd>
            </dl>
            <p className="mt-2 text-xs text-t4">Sessions use a 15 minute httpOnly cookie with rotating refresh tokens. Passwords are hashed with Argon2id. Permissions are checked by the backend on every request.</p>
          </div>
        )}
        <p className="text-xs text-t4">Preferences are stored in this browser only.</p>
      </div>
    </>
  );
}

// ---------- Voice (browser speech engine) ----------
function VoiceBlock() {
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
    const u = new SpeechSynthesisUtterance("Hello, I am the Trackify sales assistant. How can I help you today?");
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
    <div className="border-t border-hair pt-3.5">
      <Eyebrow>Voice</Eyebrow>
      <ul className="mt-2 grid gap-1.5 text-[13px]">
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            {support?.stt ? <Mic aria-hidden className="size-3.5" /> : <MicOff aria-hidden className="size-3.5" />} Speech recognition (customer voice input)
          </span>
          {support ? <StatusBadge status={support.stt ? "SUCCEEDED" : "DISABLED"} label={support.stt ? "Available" : "Unavailable"} /> : <span className="text-t3">Checking…</span>}
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            {support?.tts ? <Volume2 aria-hidden className="size-3.5" /> : <VolumeX aria-hidden className="size-3.5" />} Speech synthesis (agent voice)
          </span>
          {support ? <StatusBadge status={support.tts ? "SUCCEEDED" : "DISABLED"} label={support.tts ? "Available" : "Unavailable"} /> : <span className="text-t3">Checking…</span>}
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-1 text-xs text-t3">
          Voice
          <Select value={voiceName || ALL} onValueChange={(v) => setVoiceName(v === ALL ? "" : v)} disabled={!support?.tts}>
            <SelectTrigger className="w-full">
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
        </label>
        <label className="grid w-40 gap-1 text-xs text-t3">
          Rate <span className="num text-text">{Number(rate).toFixed(1)}x</span>
          <input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(e.target.value)} className="accent-[var(--brand)]" />
        </label>
        <button type="button" onClick={test} disabled={!support?.tts} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-hair bg-panel2 px-3 text-[13px] font-bold text-text hover:bg-panel3 disabled:opacity-50">
          <Volume2 aria-hidden className="size-3.5" /> Test voice
        </button>
      </div>
      <p className="mt-2 text-xs text-t4">Voice runs entirely in the browser. Audio never leaves the device; only the transcribed text is sent, and only after the customer consents.</p>
    </div>
  );
}
