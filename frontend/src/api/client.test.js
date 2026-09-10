import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("API client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured API base URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");

    const { default: client } = await import("./client.js");

    expect(client.defaults.baseURL).toBe("http://localhost:8000");
  });

  it("uses the default backend URL when VITE_API_BASE_URL is missing", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");

    const { default: client } = await import("./client.js");

    expect(client.defaults.baseURL).toBe(
      "https://railsync-ai-backend-1.onrender.com"
    );
  });

  it("adds Authorization header when token exists", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");

    localStorage.setItem("rsai_token", "test-token");

    const { default: client } = await import("./client.js");

    const config = {
      headers: {}
    };

    const result =
      await client.interceptors.request.handlers[0].fulfilled(config);

    expect(result.headers.Authorization).toBe("Bearer test-token");
  });

  it("does not add Authorization header when token does not exist", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");

    const { default: client } = await import("./client.js");

    const config = {
      headers: {}
    };

    const result =
      await client.interceptors.request.handlers[0].fulfilled(config);

    expect(result.headers.Authorization).toBeUndefined();
  });

  it("passes successful responses through the response interceptor", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");

    const { default: client } = await import("./client.js");

    const response = {
      status: 200,
      data: { ok: true }
    };

    const result =
      await client.interceptors.response.handlers[0].fulfilled(response);

    expect(result).toEqual(response);
  });

  it("handles 401 responses by clearing authentication data", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");

    localStorage.setItem("rsai_token", "test-token");
    localStorage.setItem("rsai_manager", "test-manager");

    const { default: client } = await import("./client.js");

    const error = {
      response: {
        status: 401
      }
    };

    const rejected =
      client.interceptors.response.handlers[0].rejected(error);

    await expect(rejected).rejects.toEqual(error);

    expect(localStorage.getItem("rsai_token")).toBeNull();
    expect(localStorage.getItem("rsai_manager")).toBeNull();
  });

  it("passes non-401 errors through the response interceptor", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");

    const { default: client } = await import("./client.js");

    const error = {
      response: {
        status: 500
      }
    };

    const rejected =
      client.interceptors.response.handlers[0].rejected(error);

    await expect(rejected).rejects.toEqual(error);
  });
});
