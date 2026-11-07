import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent, formatRelative, normalizeDecimal } from "./format";

describe("formatMoney", () => {
  it("groups thousands and keeps 3 decimals", () => {
    expect(formatMoney("1290.000", "TND")).toBe("1,290.000 TND");
    expect(formatMoney("1234567.5")).toBe("1,234,567.500 TND");
    expect(formatMoney("0")).toBe("0.000 TND");
    expect(formatMoney("-45.25", "")).toBe("-45.250");
  });
  it("rounds half-up with string math, no float drift", () => {
    expect(normalizeDecimal("0.0005")).toBe("0.001");
    expect(normalizeDecimal("1.9995")).toBe("2.000");
    expect(formatMoney("99999999999999999.999")).toBe("99,999,999,999,999,999.999 TND");
  });
  it("handles empty and invalid input", () => {
    expect(formatMoney(null)).toBe("-");
    expect(formatMoney("abc")).toBe("abc");
  });
});

describe("formatPercent / formatRelative", () => {
  it("formats ratios", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(42, { fromRatio: false, digits: 0 })).toBe("42%");
  });
  it("formats relative time", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(formatRelative("2026-01-01T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelative("2026-01-01T12:00:03Z", now)).toBe("just now");
  });
});
