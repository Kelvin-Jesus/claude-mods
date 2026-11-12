import { expect, test } from 'claude-code/testing'

import { barraAscii, cabe, nivelCache, nivelPct, PILULA, svgAnel, svgCache, svgMedidor, TRACO } from '../hooks/visual'

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x! + 0.05) / (y! + 0.05)
}
const FUNDO_ESCURO = '#1f1e1d'
const FUNDO_CLARO = '#faf9f5'

test('pílulas: texto ≥ 4.5:1 sobre o próprio fundo', () => {
  for (const [nome, p] of Object.entries(PILULA)) {
    expect([nome, contraste(p.fundo, p.texto) >= 4.5]).toEqual([nome, true])
  }
})

test('tons de gráfico: ≥ 3:1 nos dois fundos do app', () => {
  for (const [nome, cor] of Object.entries(TRACO)) {
    if (nome === 'neutro') continue // trilho decorativo: não carrega informação
    expect([nome, contraste(cor, FUNDO_ESCURO) >= 3, contraste(cor, FUNDO_CLARO) >= 3]).toEqual([nome, true, true])
  }
})

test('níveis: contexto, limite e cache', () => {
  expect(nivelPct(40, 70, 85)).toBe('ok')
  expect(nivelPct(70, 70, 85)).toBe('aviso')
  expect(nivelPct(85, 70, 85)).toBe('critico')
  expect(nivelCache(0)).toBe('info')
  expect(nivelCache(4)).toBe('critico')
  expect(nivelCache(15)).toBe('aviso')
  expect(nivelCache(43)).toBe('neutro')
})

test('SVGs: o arco cobre a fração certa e o frio é tracejado', () => {
  expect(svgAnel(50, 'ok')).toContain('stroke-dasharray="28.27 56.55"')
  expect(svgAnel(140, 'critico')).toContain('stroke-dasharray="56.55 56.55"')
  expect(svgCache(0, 60, 'info')).toContain('stroke-dasharray="2 3"')
  expect(svgCache(30, 60, 'neutro')).toContain('stroke-dasharray="25.13 50.27"')
  expect(svgMedidor(0, 'ok')).not.toContain('fill="#2e9e63"')
  expect(svgMedidor(50, 'ok')).toContain('width="28"')
})

test('o que cabe por largura e a barra ASCII', () => {
  expect(cabe(80)).toEqual({ orcamento: false, pilulaLonga: false, cache: true })
  expect(cabe(140)).toEqual({ orcamento: true, pilulaLonga: true, cache: true })
  expect(cabe(60).cache).toBe(false)
  expect(barraAscii(4, 10)).toBe('[####------]')
})
