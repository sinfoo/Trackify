import { describe, expect, it } from "vitest";
import { resolveWsUrl } from "./use-events";

describe("resolveWsUrl", () => {
  const def = "ws://localhost:8000/ws/events";
  it("keeps the default on localhost", () => expect(resolveWsUrl(def, "localhost")).toBe(def));
  it("follows the page host for loopback defaults", () => {
    expect(resolveWsUrl(def, "127.0.0.1")).toBe("ws://127.0.0.1:8000/ws/events");
    expect(resolveWsUrl(def, "192.168.1.20")).toBe("ws://192.168.1.20:8000/ws/events");
  });
  it("never rewrites an explicitly configured host", () =>
    expect(resolveWsUrl("wss://api.example.com/ws/events", "app.example.com")).toBe("wss://api.example.com/ws/events"));
});
