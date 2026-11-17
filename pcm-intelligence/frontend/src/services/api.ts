export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(body?.error || "Não foi possível conectar à API");
  if (body === null)
    throw new Error(
      "A API não respondeu em JSON. Verifique a publicação do backend.",
    );
  return body;
}
