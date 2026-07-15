import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../types.js';
import { RoundStore } from './store.js';
import { RoundPublisher, type PublishInput } from './publish.js';

const input = (round: number): PublishInput => ({
  leagueId: 'liga-varzea-a',
  seasonId: '2026',
  result: { round, matches: [] } satisfies RoundResult,
});

describe('RoundPublisher — contrato de publicação', () => {
  it('publica uma rodada nova (status published, visível no store)', async () => {
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    const out = await pub.publish(input(1));
    expect(out.status).toBe('published');
    expect(store.has('liga-varzea-a', '2026', 1)).toBe(true);
  });

  it('idempotência sequencial: re-publicar rodada commitada é no-op', async () => {
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    await pub.publish(input(1));
    const second = await pub.publish(input(1));
    expect(second.status).toBe('idempotent');
    expect(store.size()).toBe(1);
  });

  it('chamadas sobrepostas na mesma chave: uma publica, a outra recua no lock', async () => {
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    const [a, b] = await Promise.all([pub.publish(input(1)), pub.publish(input(1))]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['locked', 'published']);
    expect(store.size()).toBe(1);
  });

  it('falha parcial (síncrona): erro antes do commit → rollback total, nada observável', async () => {
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    const boom = new Error('falha injetada antes do commit');
    await expect(
      pub.publish(input(1), () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(store.has('liga-varzea-a', '2026', 1)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('falha parcial (ASSÍNCRONA): rejeição no seam de pré-commit → rollback total', async () => {
    // Regressão: o seam de pré-commit faz trabalho async (DB na 0.2). Uma rejeição
    // assíncrona NÃO pode commitar a rodada nem virar unhandledRejection silenciosa.
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    const boom = new Error('falha assíncrona antes do commit');
    await expect(pub.publish(input(1), () => Promise.reject(boom))).rejects.toBe(boom);
    expect(store.has('liga-varzea-a', '2026', 1)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('lock é liberado após falha: publicação seguinte funciona', async () => {
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    await expect(
      pub.publish(input(1), () => {
        throw new Error('x');
      }),
    ).rejects.toThrow();
    const retry = await pub.publish(input(1));
    expect(retry.status).toBe('published');
    expect(store.size()).toBe(1);
  });

  it('rodadas distintas coexistem', async () => {
    const store = new RoundStore();
    const pub = new RoundPublisher(store);
    await pub.publish(input(1));
    await pub.publish(input(2));
    expect(store.size()).toBe(2);
  });
});
