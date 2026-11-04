import { describe, expect, it } from "vitest";
import { premiumOf } from "../src/lib/espia/premium";

describe("liga Premium", () => {
  it("lo lee de cualquier campo premium verdadero/falso, también dentro de otro objeto", () => {
    expect(premiumOf({ id: "1", name: "KFC", isPremium: false })).toBe(false);
    expect(premiumOf({ id: "1", config: { premium: true } })).toBe(true);
  });
  it("si la API no dice nada, no se sabe", () => {
    expect(premiumOf({ id: "1", name: "KFC" })).toBeNull();
    expect(premiumOf(null)).toBeNull();
  });
});
