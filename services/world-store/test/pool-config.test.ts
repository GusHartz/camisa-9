// SPEC-035 (Fatia 4 — Neon): os helpers de conexão são PUROS (sem DB) → este teste sempre roda,
// mesmo sem DATABASE_URL. Prova o SSL por-ambiente (Neon liga, local desliga) e o split
// pooled/direct das migrations.
// NOTA (revisão SPEC-035): estes testes afirmam sobre a SAÍDA de buildPoolConfig (o contrato da
// função). Para URLs com `sslmode`, o `pg` deriva o SSL da própria connection string (o objeto
// explícito é sobrescrito) — por isso as URLs Neon usam `verify-full` em produção (ver ADR-002).
// O caso host-Neon-SEM-`sslmode` (NEON_HOST_ONLY) é o único onde o objeto explícito é honrado.
import { describe, expect, it } from 'vitest';
import { buildPoolConfig, pickMigrationUrl } from '../src/client.js';

const LOCAL = 'postgres://postgres:postgres@localhost:5432/camisa9_dev';
const NEON_POOLED =
  'postgres://user:pass@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
const NEON_VERIFY_FULL =
  'postgres://user:pass@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';
const NEON_DIRECT =
  'postgres://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
// host Neon SEM query string — exercita o ramo hostOf().endsWith('.neon.tech') isoladamente
// (o único caminho onde o objeto ssl explícito sobrevive ao merge do pg).
const NEON_HOST_ONLY = 'postgres://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb';

describe('buildPoolConfig — SSL por-ambiente + tuning de autosuspend (SPEC-035)', () => {
  it('URL Neon pooled (host .neon.tech + sslmode=require) → SSL ligado', () => {
    const cfg = buildPoolConfig(NEON_POOLED);
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
    expect(cfg.connectionString).toBe(NEON_POOLED);
  });

  it('URL Neon com sslmode=verify-full → SSL ligado (a forma à prova de futuro)', () => {
    expect(buildPoolConfig(NEON_VERIFY_FULL).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('URL Neon direct (host .neon.tech) → SSL ligado', () => {
    expect(buildPoolConfig(NEON_DIRECT).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('host Neon SEM sslmode → SSL ligado pelo host-suffix (o ramo que só o objeto explícito cobre)', () => {
    expect(buildPoolConfig(NEON_HOST_ONLY).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('host não-Neon mas com sslmode=require → SSL ligado (a URL manda)', () => {
    const cfg = buildPoolConfig('postgres://u:p@db.example.com:5432/x?sslmode=require');
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('URL local (localhost, sem sslmode) → SSL DESLIGADO (plaintext)', () => {
    expect(buildPoolConfig(LOCAL).ssl).toBeUndefined();
  });

  it('sslmode diferente de require/verify em host não-Neon (ex.: prefer) → SSL desligado', () => {
    expect(buildPoolConfig('postgres://u:p@localhost:5432/x?sslmode=prefer').ssl).toBeUndefined();
  });

  it('sslmode=require-foo em host não-Neon → SSL desligado (sem o falso-positivo do \\b)', () => {
    expect(
      buildPoolConfig('postgres://u:p@localhost:5432/x?sslmode=require-foo').ssl,
    ).toBeUndefined();
  });

  it('URL inválida não lança → SSL desligado (host indeterminável)', () => {
    expect(() => buildPoolConfig('não-é-uma-url')).not.toThrow();
    expect(buildPoolConfig('não-é-uma-url').ssl).toBeUndefined();
  });

  it('tuning de autosuspend presente em qualquer ambiente', () => {
    for (const url of [LOCAL, NEON_POOLED]) {
      const cfg = buildPoolConfig(url);
      expect(cfg.max).toBe(10);
      expect(cfg.idleTimeoutMillis).toBe(30_000);
      expect(cfg.connectionTimeoutMillis).toBe(10_000);
      expect(cfg.keepAlive).toBe(true);
    }
  });
});

describe('pickMigrationUrl — migrations no endpoint DIRECT (SPEC-035)', () => {
  it('prefere DATABASE_URL_UNPOOLED (direct) quando presente', () => {
    expect(
      pickMigrationUrl({ DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT }),
    ).toBe(NEON_DIRECT);
  });

  it('cai em DATABASE_URL quando não há UNPOOLED (dev/CI local sem split)', () => {
    expect(pickMigrationUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it('DATABASE_URL_UNPOOLED VAZIO cai na DATABASE_URL (|| não ??) — não aborta o migrate', () => {
    expect(pickMigrationUrl({ DATABASE_URL: LOCAL, DATABASE_URL_UNPOOLED: '' })).toBe(LOCAL);
  });

  it('undefined quando nenhuma está definida (a CLI mantém o erro genérico)', () => {
    expect(pickMigrationUrl({})).toBeUndefined();
    expect(pickMigrationUrl({ DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' })).toBeUndefined();
  });
});
