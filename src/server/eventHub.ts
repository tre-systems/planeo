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
import {
  EventSchema,
  ValidatedEyeUpdatePayloadSchema,
  type EyeUpdateType,
} from "../domain/event";
import { EYE_Y_POSITION } from "../domain/sceneConstants";

import type { Vec3 } from "../domain/common";

const encoder = new TextEncoder();

const PURGE_INTERVAL_MS = 10_000;
const EYE_MAX_AGE_MS = 30_000;

const BOX_COLORS = [
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FFA500",
  "#FF69B4",
  "#39FF14",
  "#7D05EF",
  "#FDFD33",
  "#FF7F00",
];

const DEFAULT_AGENTS = [
  { id: "ai-agent-1", displayName: "Orion" },
  { id: "ai-agent-2", displayName: "Nova" },
];

type Agent = { id: string; displayName: string };

const parseConfigInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = parseInt(String(value ?? ""), 10);
  return isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

type Subscriber = { writer: WritableStreamDefaultWriter<Uint8Array> };

export class EventHub extends DurableObject<Env> {
  private readonly eyes = new Map<string, EyeUpdateType>();
  private readonly boxes = new Map<string, BoxEventType>();
  private readonly subs = new Set<Subscriber>();

  private boxesInitialized = false;
  private agentsInitialized = false;

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

    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const subscriber: Subscriber = { writer: writable.getWriter() };
    this.subs.add(subscriber);
    await this.scheduleAlarm();

    // Replay current world state to the new subscriber.
    for (const eye of this.eyes.values()) this.writeTo(subscriber, eye);
    for (const box of this.boxes.values()) this.writeTo(subscriber, box);

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
    subscriber.writer
      .write(encoder.encode(`data:${JSON.stringify(msg)}\n\n`))
      .catch(() => this.drop(subscriber));
  }

  private drop(subscriber: Subscriber): void {
    if (!this.subs.delete(subscriber)) return;
    subscriber.writer.close().catch(() => {});
  }

  private broadcast(msg: unknown): void {
    for (const subscriber of this.subs) this.writeTo(subscriber, msg);
  }

  // --- POST: ingest client/AI events ---------------------------------------

  private async handlePost(request: Request): Promise<Response> {
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
      if (validated.data.p || validated.data.l) {
        this.setEye(
          validated.data.id,
          validated.data.p,
          validated.data.l,
          validated.data.name,
        );
      }
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
      if (validated.data.p || validated.data.o) {
        this.setBox(validated.data.id, validated.data.p, validated.data.o);
      }
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
    const existing = this.eyes.get(id);
    const newP = p ?? existing?.p;
    const newL = l ?? existing?.l;
    const newName = name ?? existing?.name;

    if (newP === undefined) return;

    const msg: EyeUpdateType = { type: "eyeUpdate", id, t: Date.now() };
    if (newP) msg.p = newP;
    if (newL) msg.l = newL;
    if (newName) msg.name = newName;

    this.eyes.set(id, msg);
    this.broadcast(msg);
  }

  private setBox(id: string, p: Vec3 | undefined, o: Vec3 | undefined): void {
    const existing = this.boxes.get(id);
    const newP = p ?? existing?.p;
    const newO = o ?? existing?.o;

    if (newP === undefined || newO === undefined || !existing?.c) return;

    const msg: BoxEventType = {
      type: "box",
      id,
      p: newP,
      o: newO,
      c: existing.c,
      t: Date.now(),
    };
    this.boxes.set(id, msg);
    this.broadcast(msg);
  }

  private purgeStale(): void {
    const now = Date.now();
    for (const [id, eye] of this.eyes) {
      if (now - eye.t > EYE_MAX_AGE_MS) this.eyes.delete(id);
    }
  }

  // --- One-time world setup ------------------------------------------------

  private initializeBoxes(): void {
    if (this.boxesInitialized || this.numberOfBoxes === 0) {
      this.boxesInitialized = true;
      return;
    }
    for (let i = 0; i < this.numberOfBoxes; i++) {
      const id = `box_${i + 1}`;
      const position: Vec3 = [i * 15 - (this.numberOfBoxes - 1) * 7.5, 5, -20];
      this.boxes.set(id, {
        type: "box",
        id,
        p: position,
        o: [0, 0, 0],
        c: BOX_COLORS[i % BOX_COLORS.length],
        t: Date.now(),
      });
    }
    this.boxesInitialized = true;
  }

  private seedAgents(): void {
    if (this.agentsInitialized) return;
    this.agentsInitialized = true;
    if (this.totalAgents <= 0) return;

    const agents = this.parseAgents().slice(0, this.totalAgents);
    agents.forEach((agent, index) => {
      if (this.eyes.has(agent.id)) return;
      const x = 20 * (index + 1) * (index % 2 === 0 ? 1 : -1);
      this.setEye(
        agent.id,
        [x, EYE_Y_POSITION, 5],
        [x, EYE_Y_POSITION, 0],
        agent.displayName,
      );
    });
  }

  private parseAgents(): Agent[] {
    if (!this.agentsConfig) return DEFAULT_AGENTS;
    try {
      const parsed = JSON.parse(this.agentsConfig);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Agent[];
    } catch {
      // fall through to defaults
    }
    return DEFAULT_AGENTS;
  }
}
