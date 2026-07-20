// Emissão / resolução / revogação da sessão (SPEC-037). Aqui — e só aqui — o token existe EM CLARO:
// ele é gerado, devolvido ao cliente uma única vez e imediatamente esquecido; o que desce para o
// player-store é sempre o `sha256hex`. Um dump do banco vazado NÃO vira sessão viva.
// Sem KDF no hash do token (diferente da SENHA, que usa argon2id): o segredo já tem 256 bits de
// entropia de CSPRNG — não há o que "fortalecer", e argon2 no caminho quente de todo request seria
// proibitivo. Relógio INJETADO (`nowMs`) — nada aqui lê `Date.now()`.
import { createHash, randomBytes } from 'node:crypto';
import {
  createSession,
  deleteSession,
  readActiveAthlete,
  readSessionByHash,
  touchSession,
  type Db,
} from '@camisa-9/player-store';
import type { SessionCtx } from '../http/types.js';

const BEARER = /^Bearer (\S+)$/;

/** O hash que representa o token no banco. O token em claro nunca é persistido nem logado. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Extrai o token de um header `Authorization` bem-formado. `null` = ausente ou malformado —
 *  e essa distinção IMPORTA: é ela que separa o 401 do 204 no logout. */
export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const m = BEARER.exec(authorization);
  return m?.[1] ?? null;
}

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: number;
}

/** Emite uma sessão nova: 256 bits de CSPRNG, base64url. O cliente vê o token UMA vez. */
export async function issueSession(
  db: Db,
  accountId: string,
  nowMs: number,
): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url');
  const created = await createSession(db, accountId, hashToken(token), nowMs);
  return { token, expiresAt: created.expiresAt.getTime() };
}

/**
 * Resolve o header em um ator. `null` = sem sessão viva (ausente, malformado, inexistente,
 * expirado pelo teto absoluto OU pela janela idle — os quatro são indistinguíveis de fora).
 * Efeito colateral declarado: desliza a janela idle (`touchSession`, throttled a 12h no WHERE).
 */
export async function resolveSession(
  db: Db,
  authorization: string | undefined,
  nowMs: number,
): Promise<SessionCtx | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const found = await readSessionByHash(db, tokenHash, nowMs);
  if (!found) return null;
  await touchSession(db, tokenHash, nowMs);
  const athlete = await readActiveAthlete(db, found.accountId);
  return { accountId: found.accountId, athleteId: athlete?.id ?? null };
}

/** Logout: destrói a linha. IDEMPOTENTE de propósito — apagar o que não existe é no-op, e é isso
 *  que impede o endpoint de virar oráculo de validade do token. */
export async function revokeSession(db: Db, authorization: string | undefined): Promise<void> {
  const token = bearerToken(authorization);
  if (!token) return;
  await deleteSession(db, hashToken(token));
}
