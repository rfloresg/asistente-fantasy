// Tests con respuestas reales de la API guardadas en tests/fixtures.
// Si la API cambia de forma, estos tests lo dicen.

import { describe, expect, it } from "vitest";
import calendar from "./fixtures/calendar-11.json";
import marketValues from "./fixtures/market-value-68.json";
import detail from "./fixtures/player-68.json";
import players from "./fixtures/players.json";
import {
  isActive,
  parseMarketValues,
  parseMatch,
  parsePlayer,
  parsePlayerWeeks,
} from "../src/lib/laliga/parse";
import type { ApiMatch, ApiPlayerDetail } from "../src/lib/laliga/types";

const now = new Date("2026-10-28T06:00:00Z");

describe("parsePlayer", () => {
  it("convierte strings a números", () => {
    const p = parsePlayer(players[0], now);
    expect(p).toMatchObject({
      id: "68",
      nickname: "Unai Simón",
      teamId: "3",
      positionId: 1,
      status: "ok",
      marketValue: 39369943,
      lastSeasonPoints: 211,
    });
    expect(typeof p.averagePoints).toBe("number");
  });

  it("marca fuera de liga como inactivo", () => {
    const rows = players.map((p) => parsePlayer(p, now));
    expect(rows.filter(isActive)).toHaveLength(2);
  });
});

describe("parseMarketValues", () => {
  it("guarda el día en hora de Madrid, no UTC", () => {
    const rows = parseMarketValues("68", marketValues);
    expect(rows.at(-1)).toEqual({ playerId: "68", day: "2026-10-28", value: 39369943, bids: 0 });
  });

  it("descarta filas sin valor", () => {
    const rows = parseMarketValues("68", [{ marketValue: "", date: "2026-10-01T00:00:00+02:00", bids: 0 }]);
    expect(rows).toHaveLength(0);
  });
});

describe("parsePlayerWeeks", () => {
  it("saca puntos y minutos de cada jornada", () => {
    const rows = parsePlayerWeeks(detail as unknown as ApiPlayerDetail);
    expect(rows).toHaveLength(2);
    const last = rows.at(-1)!;
    expect(last).toMatchObject({ playerId: "68", week: 10, points: 10, minutes: 90 });
    expect(last.stats.mins_played).toEqual([90, 2]);
  });
});

describe("parseMatch", () => {
  it("guarda ids de equipo como texto", () => {
    const m = parseMatch(calendar[0] as ApiMatch, 11);
    expect(m.week).toBe(11);
    expect(typeof m.localId).toBe("string");
    expect(m.date).toBeInstanceOf(Date);
  });
});

import crypto from "node:crypto";
import { authorizeUrl, pkce } from "../src/lib/laliga/auth";

describe("auth PKCE", () => {
  it("el challenge es SHA-256 del verifier en base64url", () => {
    const { verifier, challenge } = pkce();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("la URL de login lleva cliente móvil, PKCE y redirect de la app", () => {
    const u = new URL(authorizeUrl("abc", "xyz"));
    expect(u.searchParams.get("code_challenge")).toBe("abc");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("authredirect://com.lfp.laligafantasy");
    expect(u.searchParams.get("state")).toBe("xyz");
  });
});
