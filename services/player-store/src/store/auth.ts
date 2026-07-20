// Hashing de senha (SPEC-016) — argon2id via @node-rs/argon2 (napi prebuilt, cross-plataforma).
// Impuro (salt aleatório) → mora no services/*, NUNCA em packages/*. A senha em claro nunca
// é persistida nem logada; só o hash encoded entra na coluna.
import { hash, verify } from '@node-rs/argon2';

// Baseline OWASP p/ argon2id: memory 19 MiB, 2 iterações, paralelismo 1. Default do lib = argon2id.
export const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Deriva o hash argon2id (encoded, com salt embutido) a partir da senha em claro. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

/** Confere a senha contra o hash. Constant-time pelo próprio argon2. */
export function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password);
}
