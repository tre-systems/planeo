// EventHub Durable Object — the single authority for Planeo's shared real-time
// world. One instance (idFromName("global")) holds every connected client's eye,
// the physics boxes, and the set of open SSE connections, and broadcasts changes
// to all subscribers. This replaces the in-memory module globals that the old
// Node/Fly server kept in src/app/api/events/sseStore.ts.
//
// Bundled by Wrangler (not Next), so it imports domain schemas from their
// specific files via relative paths — never "@/domain" or modules that read
// process.env at load time (e.g. aiAgent.ts -> @/lib/env).
import { DurableObject } from "cloudflare:workers";

import {
  ValidatedBoxUpdatePayloadSchema,
  type BoxEventType,
} from "../domain/box";
import { parseAgentsConfig, parseConfigInt } from "../domain/config";
import {
  EventSchema,
  ValidatedEyeUpdatePayloadSchema,
  type EyeUpdateType,
} from "../domain/event";
import { EYE_Y_POSITION } from "../domain/sceneConstants";
import { log } from "../lib/log";

import {
  buildAgentSeedEyes,
  buildInitialBoxes,
  findStaleEyeIds,
  mergeBox,
  mergeEye,
  pickHost,
} from "./eventHubLogic";

import type { Vec3 } from "../domain/common";

const encoder = new TextEncoder();

const PURGE_INTERVAL_MS = 10_000;
const EYE_MAX_AGE_MS = 30_000;
// A consumer that stops reading its SSE stream would otherwise buffer every
// broadcast in DO memory; past this many unacknowledged writes it is dropped.
const MAX_PENDING_WRITES = 256;

type Subscriber = {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  clientId: string;
  pendingWrites: number;
};

export class EventHub extends DurableObject<Env> {
  private readonly eyes = new Map<string, EyeUpdateType>();
  private readonly boxes = new Map<string, BoxEventType>();
  private readonly subs = new Set<Subscriber>();

  private boxesInitialized = false;

  // The oldest connected client is the simulation host (drives the AI agents
  // and the box physics); re-elected when it disconnects.
  private host: string | undefined;

  private readonly numberOfBoxes: number;
  private readonly totalAgents: number;
  private readonly agentsConfig: string | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.numberOfBoxes = parseConfigInt(env.NUMBER_OF_BOXES, 5);
    this.totalAgents = parseConfigInt(env.TOTAL_AGENTS, 0);
    this.agentsConfig = env.AI_AGENTS_CONFIG || undefined;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") return this.openStream(request);
    if (request.method === "POST") return this.handlePost(request);
    return new Response("Method not allowed", { status: 405 });
  }

  // Periodic housekeeping: drop eyes that have gone stale.
  async alarm(): Promise<void> {
    this.purgeStale();
    if (this.subs.size > 0 || this.eyes.size > 0) await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(Date.now() + PURGE_INTERVAL_MS);
    }
  }

  // --- SSE subscription -----------------------------------------------------

  private async openStream(request: Request): Promise<Response> {
    this.initializeBoxes();
    this.seedAgents();
    this.purgeStale();

    // `||` (not `??`): an empty `?id=` must also fall back, or "" becomes a
    // valid client id that can win host election while `if (this.host)`
    // suppresses the broadcast — freezing the simulation for everyone.
    const clientId =
      new URL(request.url).searchParams.get("id") || crypto.randomUUID();
    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const subscriber: Subscriber = {
      writer: writable.getWriter(),
      clientId,
      pendingWrites: 0,
    };
    this.subs.add(subscriber);
    this.electHost();
    log.debug("hub", "subscriber added", {
      subscribers: this.subs.size,
      host: this.host,
    });
    await this.scheduleAlarm();

    // Replay current world state + the current host to the new subscriber.
    for (const eye of this.eyes.values()) this.writeTo(subscriber, eye);
    for (const box of this.boxes.values()) this.writeTo(subscriber, box);
    if (this.host) {
      this.writeTo(subscriber, { type: "host", hostId: this.host });
    }

    request.signal.addEventListener("abort", () => this.drop(subscriber));

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  private writeTo(subscriber: Subscriber, msg: unknown): void {
    if (subscriber.pendingWrites >= MAX_PENDING_WRITES) {
      log.warn("hub", "subscriber write queue full; dropping", {
        clientId: subscriber.clientId,
      });
      this.drop(subscriber);
      return;
    }
    subscriber.pendingWrites++;
    subscriber.writer
      .write(encoder.encode(`data:${JSON.stringify(msg)}\n\n`))
      .then(
        () => subscriber.pendingWrites--,
        () => this.drop(subscriber),
      );
  }

  private drop(subscriber: Subscriber): void {
    if (!this.subs.delete(subscriber)) return;
    subscriber.writer.close().catch(() => {});
    log.debug("hub", "subscriber dropped", { subscribers: this.subs.size });
    this.electHost();
  }

  private broadcast(msg: unknown): void {
    for (const subscriber of this.subs) this.writeTo(subscriber, msg);
  }

  // Elect the oldest connected client as host; broadcast only on change.
  private electHost(): void {
    const newHost = pickHost([...this.subs].map((s) => s.clientId));
    if (newHost !== this.host) {
      this.host = newHost;
      if (this.host) this.broadcast({ type: "host", hostId: this.host });
    }
  }

  // --- POST: ingest client/AI events ---------------------------------------

  private async handlePost(request: Request): Promise<Response> {
    // Optional write gate: with WORLD_WRITE_TOKEN set, only bearers may post
    // events — everyone else stays a read-only spectator on the SSE stream.
    const requiredToken = (this.env.WORLD_WRITE_TOKEN as string) || "";
    if (requiredToken) {
      const auth = request.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${requiredToken}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = EventSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid event structure", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const event = parsed.data;

    if (event.type === "eyeUpdate") {
      const validated = ValidatedEyeUpdatePayloadSchema.safeParse(event);
      if (!validated.success) {
        return Response.json(
          { error: "Invalid eyeUpdate", details: validated.error.flatten() },
          { status: 400 },
        );
      }
      this.setEye(
        validated.data.id,
        validated.data.p,
        validated.data.l,
        validated.data.name,
      );
    } else if (event.type === "chatMessage") {
      this.broadcast(event);
    } else if (event.type === "boxUpdate") {
      const validated = ValidatedBoxUpdatePayloadSchema.safeParse(event);
      if (!validated.success) {
        return Response.json(
          { error: "Invalid boxUpdate", details: validated.error.flatten() },
          { status: 400 },
        );
      }
      this.setBox(validated.data.id, validated.data.p, validated.data.o);
    } else {
      // "box" and "host" are server → client only; accepting them silently
      // would hide client protocol drift.
      return Response.json(
        { error: "Unsupported event type" },
        { status: 400 },
      );
    }

    return Response.json({ ok: true });
  }

  // --- State mutations (broadcast on change) -------------------------------

  private setEye(
    id: string,
    p: Vec3 | undefined,
    l: Vec3 | undefined,
    name: string | undefined,
  ): void {
    const msg = mergeEye(this.eyes.get(id), { id, p, l, name }, Date.now());
    if (!msg) return;
    this.eyes.set(id, msg);
    this.broadcast(msg);
  }

  private setBox(id: string, p: Vec3 | undefined, o: Vec3 | undefined): void {
    const msg = mergeBox(this.boxes.get(id), { id, p, o }, Date.now());
    if (!msg) return;
    this.boxes.set(id, msg);
    this.broadcast(msg);
  }

  private purgeStale(): void {
    for (const id of findStaleEyeIds(this.eyes, Date.now(), EYE_MAX_AGE_MS)) {
      this.eyes.delete(id);
    }
  }

  // --- One-time world setup ------------------------------------------------

  private initializeBoxes(): void {
    if (this.boxesInitialized || this.numberOfBoxes === 0) {
      this.boxesInitialized = true;
      return;
    }
    for (const box of buildInitialBoxes(this.numberOfBoxes, Date.now())) {
      this.boxes.set(box.id, box);
    }
    this.boxesInitialized = true;
  }

  // Runs on every stream open (not one-shot): the stale-eye purge removes
  // agent eyes when no host has been posting updates, and a world whose seeds
  // could never return would stay agentless until the DO is evicted.
  private seedAgents(): void {
    if (this.totalAgents <= 0) return;

    const seeds = buildAgentSeedEyes(
      parseAgentsConfig(this.agentsConfig),
      this.totalAgents,
      EYE_Y_POSITION,
      Date.now(),
    );
    for (const eye of seeds) {
      if (this.eyes.has(eye.id)) continue;
      this.eyes.set(eye.id, eye);
      this.broadcast(eye);
    }
  }
}
