import { lookup } from "node:dns/promises";
import net from "node:net";
import { TextDecoder } from "node:util";
import { z } from "zod";

const MAX_RESPONSE_BYTES = 20_000;
const MAX_REDIRECTS = 3;

export const httpFetchToolDefinition = {
  name: "http_fetch",
  description: "Fetch public HTTP content with GET.",
  riskLevel: "medium" as const,
  schema: z.object({
    url: z.string().url().describe("Public URL to fetch."),
  }),
  summarize(input: { url: string }) {
    return `Fetch URL ${input.url}`;
  },
  async execute(input: { url: string }) {
    let targetUrl = new URL(input.url);
    let redirects = 0;

    while (true) {
      await assertPublicHttpTarget(targetUrl);

      const response = await fetch(targetUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "user-agent": "ai-companion-cli/0.1",
        },
      });

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Redirect response missing location header.");
        }

        redirects += 1;
        if (redirects > MAX_REDIRECTS) {
          throw new Error("Too many redirects.");
        }

        targetUrl = new URL(location, targetUrl);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const { body, truncated } = await readLimitedBody(response);

      return {
        url: targetUrl.toString(),
        status: response.status,
        contentType,
        body,
        truncated,
      };
    }
  },
};

async function assertPublicHttpTarget(targetUrl: URL) {
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  }

  const hostname = targetUrl.hostname.toLowerCase();
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || isBlockedAddress(hostname)
  ) {
    throw new Error("Local and private network targets are blocked.");
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.some((entry) => isBlockedAddress(entry.address))) {
    throw new Error("Private, loopback, or link-local targets are blocked.");
  }
}

function isBlockedAddress(value: string) {
  const normalized = value.toLowerCase();
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return (
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
    );
  }

  if (ipVersion === 6) {
    const mappedPrefix = "::ffff:";
    if (normalized.startsWith(mappedPrefix)) {
      return isBlockedAddress(normalized.slice(mappedPrefix.length));
    }

    return (
      normalized === "::1"
      || normalized.startsWith("fe80:")
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
    );
  }

  return false;
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readLimitedBody(response: Response) {
  if (!response.body) {
    return { body: "", truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let truncated = false;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }

    let nextChunk = value;
    if (received + value.byteLength > MAX_RESPONSE_BYTES) {
      nextChunk = value.subarray(0, MAX_RESPONSE_BYTES - received);
      truncated = true;
    }

    received += nextChunk.byteLength;
    body += decoder.decode(nextChunk, { stream: true });

    if (truncated || received >= MAX_RESPONSE_BYTES) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  body += decoder.decode();
  return { body, truncated };
}
