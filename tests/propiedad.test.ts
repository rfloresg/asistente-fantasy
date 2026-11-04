import { describe, expect, it } from "vitest";
import type { LigaSnapshot } from "../src/lib/plan/snapshot";
import { advice, myPlayerIds, ownerOf } from "../src/lib/propiedad";

const liga: LigaSnapshot = {
  myTeamId: "t1", standing: [{ teamId: "t1", manager: "Yo", position: 1, points: 0 }, { teamId: "t2", manager: "Jonix", position: 2, points: 0 }],
  activity: [], unlocks: [], injuries: [],
  market: [{ id: "30", price: 1 }],
  owners: { "10": "t1", "20": "t2" },
};

describe("de quién es y qué hacer", () => {
  it("a uno tuyo nunca le dice Fichar", () => {
    const o = ownerOf(liga, "10");
    expect(o).toEqual({ kind: "mio" });
    expect(advice(o, "fichar", [], "10")).toMatchObject({ label: "Tuyo · Mantener", bid: false });
    expect(advice(o, "mantener", [{ tipo: "proteger", playerId: "10" }], "10").label).toBe("Tuyo · Proteger");
    expect(advice(o, "vender", [], "10").label).toBe("Tuyo · Vender");
  });
  it("de un rival: solo clausulando", () => {
    const o = ownerOf(liga, "20");
    expect(advice(o, "fichar", [], "20")).toMatchObject({ label: "De Jonix", bid: false });
    expect(advice(o, "fichar", [{ tipo: "clausulazo", playerId: "20" }], "20").label).toBe("De Jonix · Clausúlalo");
  });
  it("libre: la nota decide, y se ve si está en venta", () => {
    expect(advice(ownerOf(liga, "30"), "fichar", [], "30")).toMatchObject({ label: "En venta · Fichar", bid: true });
    expect(advice(ownerOf(liga, "40"), "fichar", [], "40").label).toBe("Fichar");
    expect(advice(ownerOf(liga, "40"), "mantener", [], "40").label).toBe("Sin prisa");
    expect(advice(ownerOf(liga, "40"), "vender", [], "40").label).toBe("No fichar"); // no es tuyo: no se vende, no se ficha
  });
  it("sin datos de la liga, como antes", () => {
    expect(ownerOf({ ...liga, owners: undefined }, "10")).toBeNull();
    expect(advice(null, "fichar", [], "10").label).toBe("Fichar");
  });
});

describe("tus jugadores", () => {
  it("salen de los dueños de la liga", () => {
    expect(myPlayerIds(liga)).toEqual(["10"]);
    expect(myPlayerIds({ ...liga, owners: undefined })).toBeNull();
  });
});
