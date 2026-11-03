// Lanza el workflow del Espía en modo plan (GitHub Actions) desde la web.
// Necesita GITHUB_DISPATCH_TOKEN (fine-grained, solo este repo, Actions: read and write).

const REPO = process.env.GITHUB_REPO ?? "rfloresg/asistente-fantasy";

export async function dispatchPlan(): Promise<string | null> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return "Falta GITHUB_DISPATCH_TOKEN en Vercel";
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/espia.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs: { modo: "plan" } }),
  });
  return res.ok ? null : `GitHub respondió ${res.status}`;
}
