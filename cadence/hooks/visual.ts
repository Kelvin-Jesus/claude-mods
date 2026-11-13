// O visual da barra: níveis, glifos, cores e os SVGs do desktop. Puro, sem `$`.
//
// Regras (WCAG 2.2 AA, medidas no fundo escuro #1f1e1d e no claro #faf9f5 do app):
// - Texto usa chave de tema (`success`, `warning`...): segue o tema da pessoa, claro ou escuro.
// - Pílula preenchida traz o próprio fundo, então o contraste não depende do tema (todas ≥ 5:1).
// - Gráfico (anel, arco, barra) usa tons médios que passam 3:1 nos dois fundos.
// - Cor nunca anda sozinha: sempre com número, palavra ou forma do glifo.

import type { Esforco } from '../types'
import { T } from './textos'

export type Nivel = 'ok' | 'aviso' | 'critico' | 'info' | 'destaque' | 'neutro'

/** A chave de tema do texto de cada nível; `undefined` é a cor do texto do app. */
export const TEMA: Record<Nivel, 'success' | 'warning' | 'error' | 'suggestion' | 'permission' | undefined> = {
  ok: 'success',
  aviso: 'warning',
  critico: 'error',
  info: 'suggestion',
  destaque: 'permission',
  neutro: undefined,
}

/** Pílulas preenchidas: fundo e texto fixos, legíveis em qualquer tema. */
export const PILULA: Record<Exclude<Nivel, 'neutro'>, { fundo: string; texto: string }> = {
  ok: { fundo: '#1a7f4b', texto: '#ffffff' },
  aviso: { fundo: '#f5a524', texto: '#1f1e1d' },
  critico: { fundo: '#c9302c', texto: '#ffffff' },
  info: { fundo: '#0b5cad', texto: '#ffffff' },
  destaque: { fundo: '#5b45c9', texto: '#ffffff' },
}

/** Tons de gráfico: ≥ 3:1 nos dois fundos do app (e no preto e no branco). */
export const TRACO: Record<Nivel, string> = {
  ok: '#2e9e63',
  aviso: '#bd7f00',
  critico: '#e0483e',
  info: '#2f86d6',
  destaque: '#7b6be6',
  neutro: '#8a8984',
}

/** A forma do glifo também diz o nível, para quem não distingue as cores. */
export const GLIFO: Record<Esforco, string> = { low: '○', medium: '◔', high: '◑', xhigh: '◕', max: '●' }
export const NIVEL_ESFORCO: Record<Esforco, Nivel> = { low: 'ok', medium: 'neutro', high: 'aviso', xhigh: 'aviso', max: 'critico' }

/** Nível de uma fração do orçamento: aviso a partir de `avisoEm`, crítico a partir de `criticoEm` (em %). */
export const nivelPct = (pct: number, avisoEm: number, criticoEm: number): Nivel =>
  pct >= criticoEm ? 'critico' : pct >= avisoEm ? 'aviso' : 'ok'

/** Cache: frio é informação; perto de expirar é aviso, quase expirando é crítico. `min` vem de `cacheMin` (0 = frio). */
export const nivelCache = (min: number): Nivel => (min <= 0 ? 'info' : min - 1 <= 5 ? 'critico' : min - 1 <= 20 ? 'aviso' : 'neutro')

/** O que cabe na linha 1 do terminal, na ordem em que sai quando falta espaço. */
export function cabe(colunas: number) {
  return { orcamento: colunas >= 100, pilulaLonga: colunas >= 110, cache: colunas >= 64 }
}

/** `[####------]` para terminal sem Unicode confiável (TERM=dumb). */
export const barraAscii = (cheias: number, total: number) => `[${'#'.repeat(cheias)}${'-'.repeat(Math.max(0, total - cheias))}]`

/** Thin bar (━): filled cells carry the tone, the rest is a dim track. A nonzero value always shows one cell, zero shows none. */
export function barraFina(pct: number, largura: number): { cheias: number; vazias: number } {
  const p = Math.max(0, pct)
  const cheias = Math.min(largura, Math.max(p > 0 ? 1 : 0, Math.floor((p * largura) / 100)))
  return { cheias, vazias: largura - cheias }
}

const num = (n: number) => Number(n.toFixed(2))

/** Anel de contexto, 24×24: trilho decorativo e arco na cor do nível, começando no topo. */
export function svgAnel(pct: number, nivel: Nivel): string {
  const c = 2 * Math.PI * 9
  const p = Math.max(0, Math.min(1, pct / 100))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${TRACO.neutro}" stroke-opacity="0.35" stroke-width="3"/>` +
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${TRACO[nivel]}" stroke-width="3" stroke-linecap="round" ` +
    `stroke-dasharray="${num(c * p)} ${num(c)}" transform="rotate(-90 12 12)"/></svg>`
  )
}

/** Arco do cache, 20×20: quanto da vida ainda resta. Frio é um anel tracejado. */
export function svgCache(restanteMin: number, ttlMin: number, nivel: Nivel): string {
  const c = 2 * Math.PI * 8
  const abre = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">`
  if (restanteMin <= 0)
    return `${abre}<circle cx="10" cy="10" r="8" fill="none" stroke="${TRACO.info}" stroke-width="2.5" stroke-dasharray="2 3"/></svg>`
  const p = Math.max(0, Math.min(1, restanteMin / Math.max(1, ttlMin)))
  return (
    `${abre}<circle cx="10" cy="10" r="8" fill="none" stroke="${TRACO.neutro}" stroke-opacity="0.35" stroke-width="2.5"/>` +
    `<circle cx="10" cy="10" r="8" fill="none" stroke="${TRACO[nivel === 'neutro' ? 'ok' : nivel]}" stroke-width="2.5" stroke-linecap="round" ` +
    `stroke-dasharray="${num(c * p)} ${num(c)}" transform="rotate(-90 10 10)"/></svg>`
  )
}

/** Medidor de limite, 56×6, cantos redondos. */
export function svgMedidor(pct: number, nivel: Nivel): string {
  const w = Math.max(0, Math.min(56, (56 * pct) / 100))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="6" viewBox="0 0 56 6">` +
    `<rect width="56" height="6" rx="3" fill="${TRACO.neutro}" fill-opacity="0.35"/>` +
    (w > 0 ? `<rect width="${num(Math.max(w, 6))}" height="6" rx="3" fill="${TRACO[nivel]}"/>` : '') +
    `</svg>`
  )
}

/** "140 thousand of 350 thousand": what a screen reader says instead of "140k/350k". */
export const porExtenso = (n: number) => T.mil(n)
