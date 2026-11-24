// Asserts mínimos para os testes, sem depender de "node:assert" (que o front-end não tem nos tipos).
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "undefined";
}

function fail(kind: string, actual: unknown, expected: string): never {
  throw new Error(`${kind} falhou\n  esperado: ${expected}\n  recebido: ${canon(actual)}`);
}

export function equal(actual: unknown, expected: unknown): void {
  if (actual !== expected) fail("equal", actual, canon(expected));
}

export function deepEqual(actual: unknown, expected: unknown): void {
  if (canon(actual) !== canon(expected)) fail("deepEqual", actual, canon(expected));
}

export function match(actual: string, pattern: RegExp): void {
  if (!pattern.test(actual)) fail("match", actual, String(pattern));
}

export function ok(value: unknown): void {
  if (!value) fail("ok", value, "valor verdadeiro");
}