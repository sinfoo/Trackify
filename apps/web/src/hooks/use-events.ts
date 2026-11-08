"use client";

import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { AppEvent } from "@/lib/types";

export type EventsStatus = "live" | "polling" | "offline";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/events";
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

/**
 * The default WS URL points at localhost. When the console is opened on another host (127.0.0.1, a LAN IP,
 * a demo machine), that socket reaches the wrong machine or carries no auth cookie and the shell is stuck on
 * Polling. Follow the page's hostname instead (cookies are host-scoped, not port-scoped).
 * ponytail: keeps the configured port and scheme; https deployments must set NEXT_PUBLIC_WS_URL to a wss:// URL.
 */
export function resolveWsUrl(configured: string, pageHostname?: string) {
  if (!pageHostname) return configured;
  try {
    const u = new URL(configured);
    if (LOOPBACK.has(u.hostname) && u.hostname !== pageHostname) u.hostname = pageHostname;
    return u.toString();
  } catch {
    return configured;
  }
}
const MAX_EVENTS = 200;
const POLL_MS = 4000;
const HEARTBEAT_TIMEOUT_MS = 45_000; // server pings every 20s

export function invalidateForEvent(qc: QueryClient, type: string) {
  const keys: (readonly string[])[] = [];
  if (type.startsWith("payment.")) keys.push(qk.payments, qk.orders, qk.analytics, qk.customers);
  if (type === "security.alert") keys.push(qk.security);
  if (type.startsWith("approval.")) keys.push(qk.approvals);
  if (type === "analytics.updated") keys.push(qk.analytics);
  if (type.startsWith("agent.")) keys.push(qk.agents);
  if (type.startsWith("workflow.")) keys.push(qk.workflows);
  if (type === "customer.message") keys.push(qk.conversations, qk.customers);
  for (const queryKey of keys) qc.invalidateQueries({ queryKey });
}

function useEventStream(enabled: boolean) {
  const qc = useQueryClient();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [status, setStatus] = useState<EventsStatus>("offline");
  const lastId = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;

    const ingest = (batch: AppEvent[]) => {
      const fresh = batch.filter((e) => typeof e.id === "number" && e.id > lastId.current);
      if (!fresh.length) return;
      lastId.current = Math.max(lastId.current, ...fresh.map((e) => e.id));
      setEvents((prev) => [...fresh.reverse(), ...prev].slice(0, MAX_EVENTS)); // newest first
      for (const t of new Set(fresh.map((e) => e.type))) invalidateForEvent(qc, t);
    };

    const poll = async () => {
      try {
        const batch = await api.get<AppEvent[]>("/events", {
          query: { after_id: lastId.current || undefined, limit: 100 },
          noAuthRedirect: true,
        });
        ingest([...batch].sort((a, b) => a.id - b.id));
        if (!disposed && ws?.readyState !== WebSocket.OPEN) {
          setStatus("polling");
          // The API answers and auth is valid: retry the socket now instead of waiting out the backoff.
          if (ws?.readyState !== WebSocket.CONNECTING) {
            clearTimeout(reconnectTimer);
            attempt = 0;
            connect();
          }
        }
      } catch {
        if (!disposed && ws?.readyState !== WebSocket.OPEN) setStatus("offline");
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      void poll();
      pollTimer = setInterval(poll, POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const armHeartbeat = () => {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => ws?.close(), HEARTBEAT_TIMEOUT_MS);
    };

    const connect = () => {
      if (disposed || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
      try {
        ws = new WebSocket(resolveWsUrl(WS_URL, window.location.hostname));
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setStatus("live");
        stopPolling();
        armHeartbeat();
        void poll(); // catch up on anything missed while disconnected
      };
      ws.onmessage = (msg) => {
        armHeartbeat();
        let data: unknown;
        try {
          data = JSON.parse(String(msg.data));
        } catch {
          return;
        }
        const d = data as { type?: string; id?: unknown };
        if (d.type === "ping") {
          ws?.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (d.type === "hello") return;
        if (typeof d.id === "number") ingest([data as AppEvent]);
      };
      ws.onclose = () => {
        clearTimeout(heartbeatTimer);
        if (disposed) return;
        startPolling();
        scheduleReconnect();
      };
      ws.onerror = () => ws?.close();
    };

    const scheduleReconnect = () => {
      clearTimeout(reconnectTimer);
      const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(heartbeatTimer);
      stopPolling();
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [enabled, qc]);

  return { events, status };
}

type EventsValue = { events: AppEvent[]; status: EventsStatus };
const EventsContext = createContext<EventsValue>({ events: [], status: "offline" });

/** Mount once inside the authenticated shell so every page shares one socket. */
export function EventsProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const value = useEventStream(enabled);
  return createElement(EventsContext.Provider, { value }, children);
}

/** `events` is newest first (max 200). `status` is live (WebSocket), polling (REST fallback) or offline. */
export function useEvents() {
  return useContext(EventsContext);
}
