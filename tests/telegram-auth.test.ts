import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramLogin } from "../src/lib/telegram-auth";

const TOKEN = "123:abc";
const signed = (data: Record<string, string>) => {
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
  const secret = crypto.createHash("sha256").update(TOKEN).digest();
  return { ...data, hash: crypto.createHmac("sha256", secret).update(check).digest("hex") };
};

describe("entrar con Telegram", () => {
  const now = String(Math.floor(Date.now() / 1000));
  it("acepta datos firmados por Telegram", () => {
    expect(verifyTelegramLogin(signed({ id: "42", first_name: "Rubén", auth_date: now }), TOKEN)?.id).toBe("42");
  });
  it("rechaza datos cambiados, otro bot o una entrada vieja", () => {
    const ok = signed({ id: "42", first_name: "Rubén", auth_date: now });
    expect(verifyTelegramLogin({ ...ok, id: "43" }, TOKEN)).toBeNull();
    expect(verifyTelegramLogin(ok, "999:otro")).toBeNull();
    expect(verifyTelegramLogin(signed({ id: "42", auth_date: String(Number(now) - 3 * 86400) }), TOKEN)).toBeNull();
  });
});
