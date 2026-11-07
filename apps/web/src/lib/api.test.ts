import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, parseApiError } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("parseApiError", () => {
  it("reads the contract envelope", () => {
    const e = parseApiError(403, { error: { code: "SELF_APPROVAL_FORBIDDEN", message: "No", details: { id: "x" } } });
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.message, e.details]).toEqual([403, "SELF_APPROVAL_FORBIDDEN", "No", { id: "x" }]);
  });
  it("falls back for FastAPI detail and empty bodies", () => {
    expect(parseApiError(422, { detail: [{ loc: ["body"] }] }).code).toBe("VALIDATION_ERROR");
    expect(parseApiError(500, undefined).code).toBe("HTTP_500");
  });
});

describe("api client", () => {
  it("sends credentials, JSON and extra headers", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    await api.post("/public/checkout/s1/pay", { payment_method: "card_ok" }, { headers: { "Idempotency-Key": "k1" } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/v1/public/checkout/s1/pay");
    expect(init?.credentials).toBe("include");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
    expect(init?.body).toBe(JSON.stringify({ payment_method: "card_ok" }));
  });

  it("refreshes once on 401 then retries", async () => {
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "expired" } }))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, { items: [], total: 0, page: 1, page_size: 25 }));
    const res = await api.get<{ total: number }>("/customers", { query: { q: "amel", page: 1, segment: undefined } });
    expect(res.total).toBe(0);
    expect(f.mock.calls.map((c) => c[0])).toEqual(["/api/v1/customers?q=amel&page=1", "/api/v1/auth/refresh", "/api/v1/customers?q=amel&page=1"]);
  });

  it("throws ApiError from the error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(429, { error: { code: "RATE_LIMITED", message: "slow down" } }));
    await expect(api.post("/auth/login", {})).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
});
