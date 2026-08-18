import { randomUUID } from "node:crypto";

/**
 * Serializes token refresh across every request that shares a session.
 *
 * Why this exists, in one sentence: the server rotates refresh tokens and
 * treats replay of an already-rotated token as theft, revoking the entire token
 * family — so a user with two tabs, or a page issuing three parallel Server
 * Component fetches, would be signed out everywhere for doing nothing wrong
 * (PRD 4.3). **Exactly one refresh may be in flight per session.**
 *
 * Two moving parts:
 *
 * - a **lock**, so only one request calls `/v1/auth/refresh`
 * - a **handoff slot**, so the requests that lost the race can pick up the
 *   session the winner produced instead of refreshing again. They cannot read
 *   it from the cookie: their own request carries the stale one.
 */
export interface SessionCoordinator {
  /** Returns a release token, or `null` if someone else holds the lock. */
  acquire(key: string, ttlMs: number): Promise<string | null>;
  release(key: string, token: string): Promise<void>;
  /** Hands the freshly sealed session to whoever is waiting. */
  publish(key: string, sealed: string, ttlMs: number): Promise<void>;
  read(key: string): Promise<string | null>;
}

type Entry = { value: string; expiresAt: number };

/**
 * Single-process implementation. Correct for `next dev` and for a single
 * container, and genuinely wrong the moment the dashboard runs more than one
 * instance — two pods would each hold their own lock and race each other into
 * the family-revocation trap. Production sets `REDIS_URL`.
 */
export class InProcessCoordinator implements SessionCoordinator {
  private readonly entries = new Map<string, Entry>();

  private live(key: string): Entry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    if (this.live(`lock:${key}`)) return null;
    const token = randomUUID();
    this.entries.set(`lock:${key}`, { value: token, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async release(key: string, token: string): Promise<void> {
    const entry = this.live(`lock:${key}`);
    // Only the holder may release, or a slow request could unlock someone
    // else's refresh after its own lock had already expired.
    if (entry?.value === token) this.entries.delete(`lock:${key}`);
  }

  async publish(key: string, sealed: string, ttlMs: number): Promise<void> {
    this.entries.set(`value:${key}`, { value: sealed, expiresAt: Date.now() + ttlMs });
  }

  async read(key: string): Promise<string | null> {
    return this.live(`value:${key}`)?.value ?? null;
  }
}

/** Release only if we still hold the lock, atomically. */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Multi-instance implementation, sharing the API's Redis. `SET NX PX` is the
 * lock; the TTL guarantees a crashed request cannot wedge a session shut.
 */
export class RedisCoordinator implements SessionCoordinator {
  constructor(private readonly redis: import("ioredis").Redis) {}

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
    return result === "OK" ? token : null;
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, `lock:${key}`, token);
  }

  async publish(key: string, sealed: string, ttlMs: number): Promise<void> {
    await this.redis.set(`value:${key}`, sealed, "PX", ttlMs);
  }

  async read(key: string): Promise<string | null> {
    return this.redis.get(`value:${key}`);
  }
}

/**
 * One coordinator per process. Cached on `globalThis` because dev HMR
 * re-evaluates modules, and a fresh in-process lock on every reload would
 * silently stop serializing anything.
 */
const globalForCoordinator = globalThis as typeof globalThis & {
  __sessionCoordinator?: SessionCoordinator;
};

export async function sessionCoordinator(): Promise<SessionCoordinator> {
  if (globalForCoordinator.__sessionCoordinator) {
    return globalForCoordinator.__sessionCoordinator;
  }

  const url = process.env.REDIS_URL;
  let coordinator: SessionCoordinator;

  if (url) {
    // Imported lazily so `ioredis` never loads when it is not configured.
    const { Redis } = await import("ioredis");
    coordinator = new RedisCoordinator(new Redis(url, { maxRetriesPerRequest: 2 }));
  } else {
    coordinator = new InProcessCoordinator();
  }

  globalForCoordinator.__sessionCoordinator = coordinator;
  return coordinator;
}
