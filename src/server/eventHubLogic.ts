// Pure logic for the EventHub Durable Object, split out so it can be unit-tested
// in a plain Node environment — this module must NOT import `cloudflare:workers`
// or anything that reads `process.env` at load. The DO (eventHub.ts) owns the
// stateful plumbing (subscribers, streams, broadcast, alarms) and calls these
// helpers. `now` is always passed in so the functions stay deterministic.

import { type AIAgent } from "../domain/config";

import type { BoxEventType } from "../domain/box";
import type { Vec3 } from "../domain/common";
import type { EyeUpdateType } from "../domain/event";

export const BOX_COLORS = [
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

// Last-write-wins merge of an incoming eye update over the existing record:
// each absent field falls back to the stored value. Returns the complete
// message to store + broadcast, or null when there is still no position.
export const mergeEye = (
  existing: EyeUpdateType | undefined,
  incoming: {
    id: string;
    p?: Vec3 | undefined;
    l?: Vec3 | undefined;
    name?: string | undefined;
  },
  now: number,
): EyeUpdateType | null => {
  const newP = incoming.p ?? existing?.p;
  const newL = incoming.l ?? existing?.l;
  const newName = incoming.name ?? existing?.name;

  if (newP === undefined) return null;

  const msg: EyeUpdateType = { type: "eyeUpdate", id: incoming.id, t: now };
  if (newP) msg.p = newP;
  if (newL) msg.l = newL;
  if (newName) msg.name = newName;
  return msg;
};

// Last-write-wins merge of a box pose update. A box's color is set at init and
// preserved here; an update for an unknown box (no existing color) is dropped.
export const mergeBox = (
  existing: BoxEventType | undefined,
  incoming: { id: string; p?: Vec3 | undefined; o?: Vec3 | undefined },
  now: number,
): BoxEventType | null => {
  const newP = incoming.p ?? existing?.p;
  const newO = incoming.o ?? existing?.o;

  if (newP === undefined || newO === undefined || !existing?.c) return null;

  return {
    type: "box",
    id: incoming.id,
    p: newP,
    o: newO,
    c: existing.c,
    t: now,
  };
};

// Eyes whose last update is older than maxAge — the purge set.
export const findStaleEyeIds = (
  eyes: Map<string, EyeUpdateType>,
  now: number,
  maxAge: number,
): string[] => {
  const stale: string[] = [];
  for (const [id, eye] of eyes) {
    if (now - eye.t > maxAge) stale.push(id);
  }
  return stale;
};

// The simulation host is the oldest connected client — i.e. the first in
// insertion order. Returns undefined when nobody is connected.
export const pickHost = (clientIds: Iterable<string>): string | undefined => {
  for (const id of clientIds) return id;
  return undefined;
};

// The initial box layout: `numberOfBoxes` cubes spread along the X axis, each
// taking the next color from the palette (cycled).
export const buildInitialBoxes = (
  numberOfBoxes: number,
  now: number,
): BoxEventType[] => {
  const boxes: BoxEventType[] = [];
  for (let i = 0; i < numberOfBoxes; i++) {
    boxes.push({
      type: "box",
      id: `box_${i + 1}`,
      p: [i * 15 - (numberOfBoxes - 1) * 7.5, 5, -20],
      o: [0, 0, 0],
      c: BOX_COLORS[i % BOX_COLORS.length],
      t: now,
    });
  }
  return boxes;
};

// Starting eye positions for the configured agents (up to totalAgents), spread
// alternately left/right of the origin along X.
export const buildAgentSeedEyes = (
  agents: AIAgent[],
  totalAgents: number,
  eyeY: number,
  now: number,
): EyeUpdateType[] =>
  agents.slice(0, totalAgents).map((agent, index) => {
    const x = 20 * (index + 1) * (index % 2 === 0 ? 1 : -1);
    return {
      type: "eyeUpdate",
      id: agent.id,
      p: [x, eyeY, 5],
      l: [x, eyeY, 0],
      name: agent.displayName,
      t: now,
    };
  });
