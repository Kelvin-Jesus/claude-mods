import { expect, test } from 'claude-code/testing'

import {
  celulas,
  comManifesto,
  economizado,
  ehSeguimento,
  esforcoDoSubagente,
  esforcoPedido,
  inclinado,
  lerConfig,
  lerConselho,
  lerVeredito,
  limitado,
  manifesto,
  mensagemSubagente,
  mantemEsforco,
  notaBench,
  rotuloCache,
  transcricao,
} from '../hooks/logica'

test('esforço pedido pelo nome, em português e inglês', async () => {
  expect(esforcoPedido('faz isso com esforço máximo')).toBe('max')
  expect(esforcoPedido('máximo esforço nesse refactor')).toBe('max')
  expect(esforcoPedido('esforço: alto')).toBe('high')
  expect(esforcoPedido('usa esforco baixo')).toBe('low')
  expect(esforcoPedido('esforço altíssimo por favor')).toBe('xhigh')
  expect(esforcoPedido('usa esforço muito alto nisso')).toBe('xhigh')
  expect(esforcoPedido('use max effort here')).toBe('max')
  expect(esforcoPedido('effort: low')).toBe('low')
  expect(esforcoPedido('xhigh nisso')).toBe('xhigh')
})

test('negação e coincidência não pedem esforço', async () => {
  expect(esforcoPedido('sem esforço máximo, é coisa simples')).toBe(undefined)
  expect(esforcoPedido("don't use max effort")).toBe(undefined)
  expect(esforcoPedido('um arquivo médio com esforço')).toBe(undefined)
  expect(esforcoPedido('o alto custo do esforço')).toBe(undefined)
  expect(esforcoPedido('renomeia a variável')).toBe(undefined)
})

test('seguimento curto mantém o esforço, a não ser que responda uma pergunta', async () => {
  expect(ehSeguimento('ok')).toBe(true)
  expect(ehSeguimento('pode seguir')).toBe(true)
  expect(ehSeguimento('refatora o módulo de auth')).toBe(false)
  expect(mantemEsforco('sim', 'user: x\nassistant: Fiz a parte A.')).toBe(true)
  expect(mantemEsforco('sim', 'user: x\nassistant: Quer que eu reescreva o módulo inteiro?')).toBe(false)
})

test('veredito do juiz: lê JSON solto no texto, recusa esforço desconhecido', async () => {
  expect(lerVeredito('claro: {"effort":"high","sure":0.8,"why":"refator grande"}')).toEqual({ esforco: 'high', certeza: 0.8, motivo: 'refator grande' })
  expect(lerVeredito('{"effort":"turbo"}')).toBe(undefined)
  expect(lerVeredito('sem json')).toBe(undefined)
})

test('viés só mexe em decisão apertada; piso, teto e economia limitam', async () => {
  expect(inclinado('medium', 0.9, 1)).toBe('medium')
  expect(inclinado('medium', 0.5, 1)).toBe('high')
  expect(inclinado('medium', 0.5, -1)).toBe('low')
  expect(inclinado('low', 0.1, -2)).toBe('low')
  expect(limitado('low', 'medium', 'max')).toBe('medium')
  expect(limitado('max', 'low', 'high')).toBe('high')
  expect(economizado('xhigh', true)).toBe('medium')
  expect(economizado('low', true)).toBe('low')
  expect(economizado('max', false)).toBe('max')
})

test('config: valor fora das opções volta ao padrão', async () => {
  const c = lerConfig({ contextBudget: '123', idleMinutes: '30', bias: '9', compactWith: 'session', autoEffort: 'off', language: 'pt-BR' })
  expect(c.janela).toBe(350_000)
  expect(c.ociosoMin).toBe(30)
  expect(c.vies).toBe(2)
  expect(c.compactarCom).toBe('session')
  expect(c.lingua).toBe('pt-BR')
  expect(lerConfig({ language: 'fr' }).lingua).toBe('en')
  expect(c.auto).toBe(false)
  expect(lerConfig(undefined).ociosoMin).toBe(60)
})

const conversa = [
  { role: 'user', text: 'corrige o login e atualiza o README', toolUses: [] },
  {
    role: 'assistant',
    text: 'Vou começar.',
    toolUses: [
      { tool: 'Read', input: { file_path: '/repo/src/login.ts' }, text: 'conteúdo' },
      { tool: 'Edit', input: { file_path: '/repo/src/login.ts', old_string: 'a', new_string: 'b' }, text: 'ok' },
      { tool: 'TodoWrite', input: { todos: [{ content: 'Corrigir login', status: 'completed' }, { content: 'Atualizar README', status: 'in_progress' }] } },
      { tool: 'Write', input: { file_path: '/repo/docs/novo.md', content: 'x' }, text: 'ok' },
    ],
  },
  { role: 'user', text: 'agora roda os testes', toolUses: [] },
]

test('manifesto: arquivos editados, tarefas abertas e último pedido literal', async () => {
  const m = manifesto(conversa)
  expect(m.editados).toEqual(['/repo/src/login.ts', '/repo/docs/novo.md'])
  expect(m.tarefas).toEqual([{ texto: 'Atualizar README', status: 'in_progress' }])
  expect(m.ultimoPedido).toBe('agora roda os testes')
})

test('o resumo leva a rede de segurança e marca o arquivo que ele esqueceu', async () => {
  const resumo = 'Corrigimos o login em src/login.ts. Falta o README.'
  const final = comManifesto(resumo, manifesto(conversa))
  expect(final.startsWith(resumo)).toBe(true)
  expect(final).toContain('- /repo/src/login.ts\n')
  expect(final).toContain('- /repo/docs/novo.md (not mentioned above)')
  expect(final).toContain('[in_progress] Atualizar README')
  expect(final).toContain('> agora roda os testes')
  expect(comManifesto('nada', { editados: [], tarefas: [], ultimoPedido: '' })).toBe('nada')
})

test('transcrição corta o meio e mantém a cauda inteira', async () => {
  const longo = 'x'.repeat(5000)
  const msgs = [
    { role: 'assistant', text: 'antigo', toolUses: [{ tool: 'Bash', input: { command: 'ls' }, text: longo }] },
    ...Array.from({ length: 6 }, (_, i) => ({ role: 'user', text: `m${i}`, toolUses: [] })),
    { role: 'assistant', text: 'recente', toolUses: [{ tool: 'Bash', input: { command: 'ls' }, text: longo }] },
  ]
  const t = transcricao(msgs)
  expect(t).toContain('+3000 caracteres')
  expect(t).toContain(`→ ${longo}`)
})

test('conselho de handoff: motivo ou nada', async () => {
  expect(lerConselho('{"handoff":"tarefa terminou"}')).toBe('tarefa terminou')
  expect(lerConselho('{"handoff":null}')).toBe(null)
  expect(lerConselho('lixo')).toBe(null)
})

test('barra cabe na largura e o cache diz minutos', async () => {
  expect(celulas(80)).toBe(8)
  expect(celulas(200)).toBe(10)
  expect(celulas(40)).toBe(6)
  expect(rotuloCache(0)).toBe('cold')
  expect(rotuloCache(1)).toBe('<1m')
  expect(rotuloCache(43)).toBe('42m')
})

test('nota do bench', async () => {
  const caso = { id: 'a', kind: 'k', current: { model: 'opus', effort: 'medium' as const }, message: 'x', ok: ['medium' as const, 'high' as const] }
  expect(notaBench(caso, 'high')).toBe('acerto')
  expect(notaBench(caso, 'low')).toBe('baixo')
  expect(notaBench(caso, 'max')).toBe('alto')
  expect(notaBench(caso, undefined)).toBe('nada')
})

test('subagente: o juiz decide pela tarefa dele, dentro dos limites', async () => {
  const cfg = { piso: 'low', teto: 'max', vies: 0 } as const
  const principal = { esforco: 'high', motivo: '', por: 'haiku' } as const
  expect(esforcoDoSubagente({ principal, veredito: { esforco: 'low', certeza: 0.9 }, config: cfg, economia: false })?.esforco).toBe('low')
  expect(esforcoDoSubagente({ principal, veredito: { esforco: 'xhigh', certeza: 0.9 }, config: cfg, economia: true })?.esforco).toBe('medium')
  expect(esforcoDoSubagente({ principal, veredito: { esforco: 'max', certeza: 0.9 }, config: { ...cfg, teto: 'high' }, economia: false })?.esforco).toBe('high')
})

test('subagente: pedido explícito ganha do juiz; sem veredito, o piso de ajudante', async () => {
  const cfg = { piso: 'low', teto: 'max', vies: 0 } as const
  const pediu = { esforco: 'max', motivo: '', por: 'pedido' } as const
  expect(esforcoDoSubagente({ principal: pediu, veredito: { esforco: 'low' }, config: cfg, economia: false })?.esforco).toBe('max')
  const juiz = { esforco: 'low', motivo: '', por: 'haiku' } as const
  expect(esforcoDoSubagente({ principal: juiz, pedido: 'xhigh', veredito: { esforco: 'low' }, config: cfg, economia: false })?.esforco).toBe('xhigh')
  expect(esforcoDoSubagente({ principal: juiz, config: cfg, economia: false })?.esforco).toBe('medium')
  expect(esforcoDoSubagente({ principal: null, config: cfg, economia: false })).toBe(undefined)
})

test('subagente: o juiz lê o tipo, a descrição e o prompt, com o aviso antes', async () => {
  const m = mensagemSubagente('Explore', 'achar o login', `procura ${'x'.repeat(5000)}`)
  expect(m.startsWith('[')).toBe(true)
  expect(m).toContain('Explore')
  expect(m).toContain('achar o login')
  expect(m.length <= 2000).toBe(true)
})
