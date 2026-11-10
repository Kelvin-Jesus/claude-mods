import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { Ctx } from '../types'

/** Limite do autocompact (o mesmo de CLAUDE_CODE_AUTO_COMPACT_WINDOW). */
const LIMITE = 350_000
/** Até aqui fica verde; em VERMELHO_EM tokens chega ao vermelho máximo. */
const VERDE_ATE = 50_000
const VERMELHO_EM = 300_000
const OCIOSO_MS = 60 * 60 * 1000
/** Abaixo disso não vale a pena compactar por ociosidade. */
const MINIMO_PARA_COMPACTAR = 30_000

/** A contagem regressiva aparece na faixa só nos últimos minutos. */
const AVISO_MIN = 15
const TICK_MS = 60 * 1000
/** O que o resumo do compact por ociosidade deve preservar. */
const INSTRUCOES_COMPACT =
  'Preserve o plano atual e em que passo ele está, as tarefas abertas, as decisões ' +
  'tomadas com o motivo, e os caminhos exatos dos arquivos mexidos. Resuma o resto.'

const limite5h = atom({ plugin: 'contexto-pct', key: 'limite5h' } as const, null as number | null)
const compactaEm = atom({ plugin: 'contexto-pct', key: 'compactaEm' } as const, null as number | null)

const ler5h = (rl: readonly SessionRateLimit[]): number | null =>
  rl.find(r => r.kind === 'five_hour')?.percentUsed ?? null

const ctx = atom({ plugin: 'contexto-pct', key: 'ctx' } as const, { tokens: null, window: LIMITE } as Ctx)

const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const janela = (w: number) => Math.min(w, LIMITE)

/** Quadradinhos da barra, estilo gráfico de commits do GitHub. */
const CELULAS = 20

/**
 * Verde (hue 120) até 50k, vermelho (hue 0) em 300k. A curva t^1.6 segura o
 * amarelo/laranja e deixa o vermelho forte só perto dos 300k.
 */
const cor = (tokens: number): string => {
  const lin = Math.min(Math.max((tokens - VERDE_ATE) / (VERMELHO_EM - VERDE_ATE), 0), 1)
  const t = lin ** 1.6
  const hue = 120 * (1 - t)
  const l = 0.5
  const s = 0.85
  const k = (n: number) => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

const guardar = (c: SessionContextUsage): Ctx => ({ tokens: c.tokens ?? null, window: c.window })

export const register: Register = on => {
  let ocioso: Timer | undefined
  let trabalhando = false

  const cancelar = () => {
    ocioso?.cancel()
    ocioso = undefined
  }

  on('session.start', async ($, e, next) => {
    $.ui.status(undefined) // a v0.1 usava a status line; agora é a faixa acima do prompt
    const r = await next(e)
    const { context, rateLimits } = await $.session.usage()
    await update($, ctx, () => guardar(context))
    await update($, limite5h, () => ler5h(rateLimits))
    await update($, compactaEm, () => null)
    return r
  })

  on('session.measure', async ($, e, next) => {
    await update($, ctx, () => guardar(e.context))
    await update($, limite5h, () => ler5h(e.rateLimits))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    cancelar()
    await update($, compactaEm, () => null)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      trabalhando = true
      cancelar()
      await update($, compactaEm, () => null)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    trabalhando = false
    cancelar()
    await update($, compactaEm, () => null)
    const inicio = await $.clock.now()
    ocioso = $.clock.every(TICK_MS, async () => {
      if (trabalhando) return
      const restanteMs = OCIOSO_MS - ((await $.clock.now()) - inicio)
      if (restanteMs > 0) {
        const min = Math.ceil(restanteMs / TICK_MS)
        await update($, compactaEm, () => (min <= AVISO_MIN ? min : null))
        return
      }
      cancelar()
      await update($, compactaEm, () => null)
      const { context } = await $.session.usage()
      if ((context.tokens ?? 0) < MINIMO_PARA_COMPACTAR) return
      try {
        const r = await $.session.compact({ instructions: INSTRUCOES_COMPACT })
        if (!('skip' in r && r.skip)) $.ui.toast('contexto-pct: 1h sem uso, conversa compactada')
      } catch {
        // um turno começou nesse meio-tempo; o próximo turn.complete reagenda
      }
    })
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const c = await read($, ctx)
    const uso5h = await read($, limite5h)
    const faltaMin = await read($, compactaEm)
    const fundo5h = (u: number) => (u >= 90 ? '#e5484d' : u >= 70 ? '#f5a524' : '#2f8f5b')
    const cauda = (
      <>
        <Box flexGrow={1} />
        {faltaMin !== null ? (
          <Text backgroundColor="#f5a524" color="#000000" bold>
            {' '}compacta em {faltaMin}min{' '}
          </Text>
        ) : null}
        {faltaMin !== null && uso5h !== null ? <Text> </Text> : null}
        {uso5h !== null ? (
          <Text backgroundColor={fundo5h(uso5h)} color="#ffffff" bold>
            {' '}5h {Math.round(uso5h)}%{' '}
          </Text>
        ) : null}
      </>
    )
    const w = janela(c.window)

    if (c.tokens === null) {
      return (
        <Box flexDirection="row" flexGrow={1}>
          <Text dimColor>ctx —/{fmtK(w)}</Text>
          {cauda}
        </Box>
      )
    }

    const pct = Math.round((c.tokens / w) * 100)
    const isCritico = c.tokens >= VERMELHO_EM

    const passo = w / CELULAS
    const barra = Array.from({ length: CELULAS }, (_, i) => {
      const isCheia = c.tokens! > i * passo
      return isCheia ? (
        <Text key={`c${i}`} color={cor((i + 1) * passo)}>■ </Text>
      ) : (
        <Text key={`c${i}`} dimColor>□ </Text>
      )
    })

    return (
      <Box flexDirection="row" flexGrow={1}>
        <Text color={cor(c.tokens)} bold={isCritico}>ctx </Text>
        {barra}
        <Text color={cor(c.tokens)} bold={isCritico}>
          {pct}% ({fmtK(c.tokens)}/{fmtK(w)})
        </Text>
        {isCritico ? <Text color={cor(c.tokens)}> · hora de compactar (/compact)</Text> : null}
        {cauda}
      </Box>
    )
  })
}
