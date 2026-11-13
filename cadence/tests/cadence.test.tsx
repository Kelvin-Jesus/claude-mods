import { expect, mock, test } from 'claude-code/testing'

import { TRACO } from '../hooks/visual'

const CONVERSA = [
  { role: 'user' as const, text: 'corrige o login', toolUses: [] },
  {
    role: 'assistant' as const,
    text: 'Feito.',
    toolUses: [{ tool_use_id: 't1', tool: 'Edit', input: { file_path: '/repo/src/login.ts' }, text: 'ok' }],
  },
  { role: 'user' as const, text: 'agora roda os testes', toolUses: [] },
]

const USO = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const BANDA = {
  plugin: 'cadence',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('a compactação sai do Haiku e leva o manifesto embaixo', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const pedidos: { model: string; prompt: unknown }[] = []
  on('session.messages', () => ({ value: CONVERSA }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.complete', (_, e) => {
    pedidos.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: `Resumo: corrigimos o login. ${'detalhe '.repeat(40)}`, usage: USO } }
  })
  on('session.compact', () => ({ messages: [] }))

  const r = await $.session.compact({ trigger: 'manual', messages: CONVERSA, instructions: 'foca nos testes' })

  expect(pedidos.length).toBe(1)
  expect(pedidos[0]?.model).toBe('claude-haiku-5-5')
  expect(String(pedidos[0]?.prompt)).toContain('foca nos testes')
  expect(String(pedidos[0]?.prompt)).toContain('Preserve the current plan')
  const texto = r.messages?.[0]?.text ?? ''
  expect(texto).toContain('Resumo: corrigimos o login.')
  expect(texto).toContain('/repo/src/login.ts')
  expect(texto).toContain('> agora roda os testes')
})

test('se o Haiku falhar, o modelo do chat compacta com as instruções de preservação', async ($, on) => {
  mock.clock(on)
  let instrucoes: string | undefined
  on('session.messages', () => ({ value: CONVERSA }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USO } }))
  const avisos: string[] = []
  on('ui.toast', (_, e) => {
    avisos.push(String(e.text ?? e))
    return { value: undefined }
  })
  on('session.compact', (_, e) => {
    instrucoes = e.instructions
    return { messages: [{ role: 'user' as const, text: 'resumo do motor', toolUses: [] }] }
  })

  await $.session.compact({ trigger: 'auto', messages: CONVERSA })

  expect(instrucoes).toContain('Preserve the current plan')
  expect(avisos.join(' ')).toContain('Haiku did not compact')
})

test('compactar com o modelo do chat passa adiante, só somando as instruções', { options: { compactWith: 'session' } }, async ($, on) => {
  mock.clock(on)
  let instrucoes: string | undefined
  let chamouModelo = false
  on('model.complete', () => {
    chamouModelo = true
    return { value: { isAnswered: false, reason: 'empty-reply', usage: USO } }
  })
  on('session.messages', () => ({ value: CONVERSA }))
  on('session.compact', (_, e) => {
    instrucoes = e.instructions
    return { messages: [{ role: 'user' as const, text: 'resumo do motor', toolUses: [] }], tokensBefore: 200_000, tokensAfter: 9_000 }
  })

  await $.session.compact({ trigger: 'manual', messages: CONVERSA, instructions: 'foca no bug' })

  expect(chamouModelo).toBe(false)
  expect(instrucoes).toContain('Preserve the current plan')
  expect(instrucoes).toContain('foca no bug')
})

test('precompute é recusado: o resumo adiantado seria do modelo do chat e iria fora', async ($, on) => {
  mock.clock(on)
  let chegou = false
  on('session.compact', () => {
    chegou = true
    return { messages: [{ role: 'user' as const, text: 'x', toolUses: [] }] }
  })

  const r = await $.session.compact({ trigger: 'precompute', messages: CONVERSA })

  expect(chegou).toBe(false)
  expect(r.skip).toContain('Haiku')
})

test('o juiz escolhe o esforço do prompt e a barra mostra', async ($, on) => {
  mock.clock(on, { now: 5_000 })
  on('session.messages', () => ({ value: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 120_000, window: 1_000_000, percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 62 }] } }))
  on('command.register', () => ({ value: { command: 'cadence' } }))
  on('command.list', () => ({ value: [] }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"effort":"high","sure":0.9,"why":"refator grande"}', usage: USO } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'refatora o módulo de auth inteiro', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /high/ })) !== undefined).toBe(true)
  expect((await ui.find({ type: 'Text', text: ' 34%' }))?.text).toBe(' 34%')
  expect((await ui.find({ type: 'Text', text: / 120k\/350k/ }))?.text).toContain('120k/350k')
  expect((await ui.find({ type: 'Text', text: ' 62%' })) !== undefined).toBe(true)
  await ui.unmount()
})

test('"esforço máximo" na mensagem dispensa o juiz', async ($, on) => {
  mock.clock(on)
  let juiz = 0
  on('session.messages', () => ({ value: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: [] }))
  on('model.complete', () => {
    juiz++
    return { value: { isAnswered: true, text: '{"effort":"low","sure":0.9,"why":"x"}', usage: USO } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'revisa a arquitetura com esforço máximo', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(juiz).toBe(0)
  expect((await ui.find({ type: 'Text', text: /max/ })) !== undefined).toBe(true)
  await ui.unmount()
})

test('heavy context shows the warning with Compact first and New chat', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 320_000, window: 1_000_000, percent: 32 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'cadence' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    expect(await ui.find({ type: 'Text', text: /^Heavy context/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /every message rereads/ }))?.text).toContain('320k')
    expect((await ui.find({ type: 'Button', key: 'compactar' }))?.props.variant).toBe('primary')
    expect((await ui.find({ type: 'Button', key: 'handoff' }))?.props.label).toBe('New chat')
    expect((await ui.find({ type: 'Button', key: 'fechar' }))?.props.role).toBe('dismiss')
    await ui.unmount()
  }
})

test('desktop: anel de contexto e medidor de limite com texto alternativo; terminal: pílula âmbar com texto escuro', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 140_000, window: 1_000_000, percent: 14 }, rateLimits: [{ kind: 'five_hour', percentUsed: 76 }] },
  }))
  on('command.register', () => ({ value: { command: 'cadence' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const desk = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  const svgs = await desk.findAll({ type: 'Svg' })
  const alts = svgs.map(s => String(s.props.alt))
  expect(alts[0]).toBe('Context 40%, 140 thousand of 350 thousand')
  expect(String(svgs[0]?.props.source)).toContain('stroke-dasharray')
  expect(alts.some(a => a.startsWith('5-hour limit at 76%'))).toBe(true)
  await desk.unmount()

  const term = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: ' 76%' }))?.props.color).toBe('warning')
  expect((await term.find({ type: 'Text', text: /^━{3}●$/ }))?.props.color).toBe(TRACO.ok)
  expect((await term.find({ type: 'Text', text: /^─{6}$/ }))?.text).toBe('──────')
  await term.unmount()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PROMPT_BASE = ($: any, on: any) => {
  on('session.messages', () => ({ value: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50_000, window: 1_000_000, percent: 5 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'cadence' } }))
  on('command.list', () => ({ value: [] }))
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  return $
}

test('the local judge (Ollaya) decides offline and Haiku is never called', { options: { judge: 'local' } }, async ($, on) => {
  mock.clock(on, { now: 5_000 })
  PROMPT_BASE($, on)
  const pedidos: { url: string; auth?: string; modelo?: string }[] = []
  let haiku = 0
  on('http.fetch', (_: unknown, e: { url: string; init?: { headers?: Record<string, string>; body?: string } }) => {
    pedidos.push({ url: e.url, auth: e.init?.headers?.authorization, modelo: JSON.parse(e.init?.body ?? '{}').model })
    return { value: { status: 200, ok: true, headers: {}, text: '{"answers":{"effort":{"choice":"xhigh","confidence":0.91}}}' } }
  })
  on('model.complete', () => {
    haiku++
    return { value: { isAnswered: true, text: '{"effort":"low","sure":0.9,"why":"x"}', usage: USO } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'find out why the worker hangs in production', wait: false, origin: { kind: 'composer' } })

  expect(pedidos).toEqual([{ url: 'http://127.0.0.1:11435/v1/systemone', auth: 'Bearer local', modelo: 'laya:multilingual' }])
  expect(haiku).toBe(0)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /very high/ })) !== undefined).toBe(true)
  await ui.unmount()
})

test('language pt-BR: the band speaks Portuguese, commands stay English', { options: { language: 'pt-BR' } }, async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 320_000, window: 1_000_000, percent: 32 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'cadence' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Contexto pesado/ })).toBeTruthy()
  expect((await ui.find({ type: 'Button', key: 'handoff' }))?.props.label).toBe('Novo chat')
  await ui.unmount()
})

test('local judge down: warns once and Haiku decides', { options: { judge: 'local' } }, async ($, on) => {
  mock.clock(on, { now: 5_000 })
  PROMPT_BASE($, on)
  const avisos: string[] = []
  let haiku = 0
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  on('ui.toast', (_, e) => {
    avisos.push(String((e as { text?: string }).text ?? e))
    return { value: undefined }
  })
  on('model.complete', () => {
    haiku++
    return { value: { isAnswered: true, text: '{"effort":"high","sure":0.9,"why":"x"}', usage: USO } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'refatora o módulo de auth inteiro', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: 'agora migra o banco de pagamentos', wait: false, origin: { kind: 'composer' } })

  expect(haiku).toBe(2)
  expect(avisos.filter(a => a.includes('is not reachable')).length).toBe(1)
})

test('Jev with the key from options: Bearer on the request, unsure goes to Haiku', { options: { judge: 'jev', typesafeKey: 'ts_teste' } }, async ($, on) => {
  mock.clock(on, { now: 5_000 })
  PROMPT_BASE($, on)
  const auth: string[] = []
  let haiku = 0
  on('http.fetch', (_, e) => {
    auth.push(e.init?.headers?.authorization ?? '')
    return { value: { status: 200, ok: true, headers: {}, text: '{"answers":{"effort":{"choice":"max","confidence":0.3}}}' } }
  })
  on('model.complete', () => {
    haiku++
    return { value: { isAnswered: true, text: '{"effort":"medium","sure":0.9,"why":"x"}', usage: USO } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'ajusta o texto do botão de salvar', wait: false, origin: { kind: 'composer' } })

  expect(auth).toEqual(['Bearer ts_teste'])
  expect(haiku).toBe(1)
})

const SPAWN = {
  tool_use_id: 'tu1',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
} as const
const CMD = { command: 'cadence', origin: { kind: 'composer' }, presentation: { isFullscreen: false } }

test('o juiz escolhe o esforço de cada subagente pela tarefa dele', async ($, on) => {
  mock.clock(on)
  const perguntas: string[] = []
  on('session.messages', () => ({ value: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: [] }))
  on('model.complete', (_, e) => {
    perguntas.push(String(e.prompt))
    const sub = String(e.prompt).includes('subagent')
    return { value: { isAnswered: true, text: sub ? '{"effort":"low","sure":0.9,"why":"só busca"}' : '{"effort":"high","sure":0.9,"why":"refator"}', usage: USO } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000, percent: 0 }, rateLimits: [] } }))

  await $.prompt.submit({ text: 'refatora o módulo de auth inteiro', wait: false, origin: { kind: 'composer' } })
  await $.agent.spawn({ ...SPAWN, prompt: 'acha onde o login valida a senha', description: 'achar login' })

  expect(perguntas.some(p => p.includes('acha onde o login valida a senha'))).toBe(true)
  const { text } = await $.command.run({ ...CMD, args: 'stats' } as never)
  expect(String(text)).toMatch(/Subagents: 1 routed \(low 1\)/)
})

test('com o auto desligado, o subagente não passa pelo juiz', async ($, on) => {
  mock.clock(on)
  let juiz = 0
  on('session.messages', () => ({ value: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.complete', () => {
    juiz++
    return { value: { isAnswered: true, text: '{"effort":"low","sure":0.9,"why":"x"}', usage: USO } }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))

  await $.command.run({ ...CMD, args: 'auto' } as never)
  await $.agent.spawn({ ...SPAWN, prompt: 'acha o login', description: 'achar' })

  expect(juiz).toBe(0)
})
