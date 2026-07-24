import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosRequestConfig } from "axios";

const axiosMock = vi.hoisted(() => {
  const fn = vi.fn(async (_config: AxiosRequestConfig) => ({ data: { ok: true } }));
  return Object.assign(fn, { isAxiosError: (_e: unknown): _e is never => false });
});

vi.mock("axios", () => ({ default: axiosMock }));

describe("fetchOrError — redirect posture", () => {
  beforeEach(() => {
    axiosMock.mockClear();
  });

  it("calls axios with maxRedirects: 0 by default (never follow redirects)", async () => {
    const { fetchOrError } = await import("../../src");

    await fetchOrError({ url: "https://example.com" });

    expect(axiosMock).toHaveBeenCalledTimes(1);
    const config = axiosMock.mock.calls[0][0];
    expect(config.maxRedirects).toBe(0);
  });

  it("does not let a caller override maxRedirects back on", async () => {
    const { fetchOrError } = await import("../../src");

    await fetchOrError({ url: "https://example.com", maxRedirects: 5 });

    const config = axiosMock.mock.calls[0][0];
    expect(config.maxRedirects).toBe(0);
  });
});
