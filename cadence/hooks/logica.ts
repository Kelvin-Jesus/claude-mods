// Lógica pura do cadence: nada aqui chama o motor, então tudo é testável sem sessão.
// O juiz de esforço, o prompt de handoff e a compactação por Haiku partem do effortless
// (github.com/HeyCubit/effortless, MIT), adaptados para português e para a barra em tokens.

import type { Esforco, Escolha, Gasto, ModoJuiz, NomeJuiz } from '../types'
import { T, type Lingua } from './textos'

export const ESFORCOS: Esforco[] = ['low', 'medium', 'high', 'xhigh', 'max']
/** The effort's name in the chosen language. */
export const NOME_ESFORCO: Record<Esforco, string> = new Proxy({} as Record<Esforco, string>, { get: (_, k) => T.esforco[k as Esforco] })

export const HAIKU = 'claude-haiku-5-5'

/**
 * Trocar o esforço entre duas requisições só preserva o cache de prompt no Opus e no Sonnet 5.5.
 * Nos outros (Fable 5.1, Opus antigos) a troca reescreveu 56–100% do cache, medido pelo effortless:
 * custa mais do que qualquer esforço economiza, então o Auto pausa.
 */
export const cacheSeguro = (modelo: string) => /(opus|sonnet)-5-5/.test(modelo)
export const semEsforco = (modelo: string) => /haiku/.test(modelo)

/** Preço por milhão de tokens (US$), da página de preços da Anthropic. Haiku acima de 100k: o dobro, estimado. */
export const PRECO: Record<'opus' | 'sonnet' | 'haiku' | 'fable', { in: number; read: number; write: number; out: number }> = {
  opus: { in: 4, read: 0.2, write: 5, out: 20 },
  sonnet: { in: 2, read: 0.1, write: 2.5, out: 10 },
  haiku: { in: 0.1, read: 0.01, write: 0.125, out: 0.5 },
  fable: { in: 10, read: 0.25, write: 12.5, out: 50 },
}
export const familia = (modelo: string): keyof typeof PRECO =>
  /haiku/.test(modelo) ? 'haiku' : /sonnet/.test(modelo) ? 'sonnet' : /fable|mythos/.test(modelo) ? 'fable' : 'opus'

export type Uso = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/** Custo de uma requisição em dólares, ao preço de API do modelo. */
export function dolares(uso: Uso, modelo: string): number {
  const p = PRECO[familia(modelo)]
  return (
    ((uso.input_tokens ?? 0) * p.in +
      (uso.cache_creation_input_tokens ?? 0) * p.write +
      (uso.cache_read_input_tokens ?? 0) * p.read +
      (uso.output_tokens ?? 0) * p.out) /
    1_000_000
  )
}

export const GASTO_VAZIO: Gasto = {
  prompts: 0,
  requisicoes: 0,
  usd: 0,
  porEsforco: {},
  juiz: { vezes: 0, ms: 0, usd: 0, seguimentos: 0, pedidos: 0, por: {}, falhas: 0 },
  compactacoes: { haiku: 0, sessao: 0, falhas: 0, antes: 0, depois: 0, usd: 0, usdSessaoEstimado: 0 },
  handoffs: 0,
  subagentes: {},
}

/** Um valor guardado por uma versão anterior, completado com os campos que faltarem. */
export function comoGasto(v: unknown): Gasto {
  const o = (v ?? {}) as Partial<Gasto>
  return {
    ...GASTO_VAZIO,
    ...o,
    porEsforco: { ...(o.porEsforco ?? {}) },
    juiz: { ...GASTO_VAZIO.juiz, ...(o.juiz ?? {}), por: { ...(o.juiz?.por ?? {}) } },
    compactacoes: { ...GASTO_VAZIO.compactacoes, ...(o.compactacoes ?? {}) },
    subagentes: { ...(o.subagentes ?? {}) },
  }
}

// ---------------------------------------------------------------- configuração

export type Config = {
  janela: number
  auto: boolean
  piso: Esforco
  teto: Esforco
  vies: number
  compactarCom: 'haiku' | 'session'
  ociosoMin: number
  minimoCompactar: number
  pantanoPct: number
  depoisHandoff: 'continue' | 'wait' | 'copy'
  conselho: boolean
  skillHandoff: string
  juiz: ModoJuiz
  juizUrl: string
  juizModelo: string
  typesafeKey: string
  lingua: Lingua
}

export const OPCOES = {
  contextBudget: ['200000', '300000', '350000', '500000', '750000', '1000000'],
  idleMinutes: ['0', '15', '30', '45', '60', '90', '120'],
  idleMinTokens: ['15000', '30000', '60000', '100000'],
  heavyPct: ['60', '70', '75', '80', '85', '90'],
} as const

const num = (v: unknown, padrao: number, ok?: readonly string[]) => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  if (ok && !ok.includes(s)) return padrao
  const n = Number(s)
  return Number.isFinite(n) && s !== '' ? n : padrao
}
const esf = (v: unknown, padrao: Esforco): Esforco =>
  ESFORCOS.includes(v as Esforco) ? (v as Esforco) : padrao

/** As opções do userConfig, limpas: valor fora do esperado volta ao padrão. */
export function lerConfig(opcoes: unknown): Config {
  const o = (opcoes ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return {
    janela: num(o.contextBudget, 350_000, OPCOES.contextBudget),
    auto: str(o.autoEffort) !== 'off',
    piso: esf(str(o.minEffort), 'low'),
    teto: esf(str(o.maxEffort), 'max'),
    vies: Math.max(-2, Math.min(2, Math.round(num(o.bias, 0)))),
    compactarCom: str(o.compactWith) === 'session' ? 'session' : 'haiku',
    ociosoMin: num(o.idleMinutes, 60, OPCOES.idleMinutes),
    minimoCompactar: num(o.idleMinTokens, 30_000, OPCOES.idleMinTokens),
    pantanoPct: num(o.heavyPct, 85, OPCOES.heavyPct),
    depoisHandoff: str(o.afterHandoff) === 'wait' ? 'wait' : str(o.afterHandoff) === 'copy' ? 'copy' : 'continue',
    conselho: str(o.handoffAdvice) !== 'off',
    skillHandoff: str(o.handoffSkill).replace(/^\//, ''),
    juiz: (['auto', 'haiku', 'jev', 'local'] as const).find(m => m === str(o.judge)) ?? 'auto',
    juizUrl: str(o.localUrl),
    juizModelo: str(o.localModel),
    typesafeKey: str(o.typesafeKey),
    lingua: str(o.language) === 'pt-BR' ? 'pt-BR' : 'en',
  }
}

// ---------------------------------------------------------------- esforço

/** Os ajustes do usuário sobre o veredito: viés nas decisões apertadas, depois piso e teto, depois modo economia. */
export function inclinado(e: Esforco, certeza: number | undefined, vies: number): Esforco {
  if (!vies || certeza === undefined || certeza >= (Math.abs(vies) === 1 ? 0.65 : 0.85)) return e
  return ESFORCOS[Math.max(0, Math.min(ESFORCOS.length - 1, ESFORCOS.indexOf(e) + Math.sign(vies)))] ?? e
}
export function limitado(e: Esforco, piso: Esforco, teto: Esforco): Esforco {
  const lo = ESFORCOS.indexOf(piso)
  const hi = Math.max(lo, ESFORCOS.indexOf(teto))
  return ESFORCOS[Math.max(lo, Math.min(hi, ESFORCOS.indexOf(e)))] ?? e
}
export function economizado(e: Esforco, economia: boolean): Esforco {
  return economia && ESFORCOS.indexOf(e) > ESFORCOS.indexOf('medium') ? 'medium' : e
}
export const acima = (a: Esforco, b: Esforco) => ESFORCOS.indexOf(a) > ESFORCOS.indexOf(b)
/** Subagente devolve resposta sem revisão: nunca abaixo de médio. */
export const pisoAjudante = (e: Esforco): Esforco => (acima('medium', e) ? 'medium' : e)

/**
 * O que o juiz lê sobre um subagente: o aviso vem primeiro porque a pergunta corta a mensagem em 2000 caracteres.
 * O subagente começa sem a conversa, então o juiz julga só a tarefa dele.
 */
export function mensagemSubagente(tipo: string, descricao: string, prompt: string): string {
  const aviso = `[A ${tipo} subagent runs this task alone: it gets only the prompt below, cannot ask anything back, and its answer goes to the main agent. Judge the effort this task needs, not the main conversation. Finding or reading files is low; writing, debugging or reviewing code is medium or more.]`
  return `${aviso}\n\nTask: ${descricao}\n\n${prompt}`.slice(0, 2000)
}

/**
 * O esforço de um subagente. Um pedido explícito da pessoa na conversa principal vale para os subagentes dela;
 * depois, um esforço escrito no prompt do subagente; depois, o juiz sobre a tarefa, nos limites e na economia;
 * sem veredito, o piso de ajudante sobre o esforço principal.
 */
export function esforcoDoSubagente(o: {
  principal: Escolha | null
  pedido?: Esforco
  veredito?: { esforco: Esforco; certeza?: number; motivo?: string }
  config: Pick<Config, 'piso' | 'teto' | 'vies'>
  economia: boolean
  porJuiz?: NomeJuiz
}): Escolha | undefined {
  if (o.principal?.por === 'pedido') return { ...o.principal }
  if (o.pedido) return { esforco: o.pedido, motivo: '', por: 'pedido' }
  if (o.veredito) {
    const v = o.veredito
    const esforco = economizado(limitado(inclinado(v.esforco, v.certeza, o.config.vies), o.config.piso, o.config.teto), o.economia)
    return { esforco, motivo: v.motivo ?? '', por: o.porJuiz ?? 'haiku', ...(v.certeza !== undefined ? { certeza: v.certeza } : {}) }
  }
  return o.principal ? { ...o.principal, esforco: pisoAjudante(o.principal.esforco), por: 'seguimento' } : undefined
}

/** "ok", "vai", "sim", "pode ir": até duas palavras e doze caracteres. */
export function ehSeguimento(texto: string): boolean {
  const t = texto.trim()
  return t.length > 0 && t.length <= 12 && t.split(/\s+/).length <= 2
}

/** A última resposta terminou numa pergunta: um "B" ou "sim" depois dela responde, e pode abrir trabalho grande. */
export function terminaEmPergunta(contexto: string): boolean {
  const resposta = contexto.split('\nassistant: ').pop() ?? ''
  return contexto.includes('assistant: ') && resposta.slice(-400).includes('?')
}

export const mantemEsforco = (mensagem: string, contexto: string) =>
  ehSeguimento(mensagem) && !terminaEmPergunta(contexto)

const NIVEL_EN = '(low|medium|high|xhigh|x-high|extra[- ]high|max|maximum)'
const NIVEL_PT = '(baixo|m[eé]dio|muito alto|alto|alt[ií]ssimo|extra[- ]alto|m[aá]ximo|m[aá]x)'
const PEDIDO = new RegExp(
  [
    `\\b${NIVEL_EN}\\s+effort\\b`,
    `\\beffort(?:\\s+level)?\\s*(?:[:=]|to|at|of|on)?\\s*${NIVEL_EN}\\b`,
    `\\bxhigh\\b`,
    `\\besfor[cç]o\\s*(?:[:=]|em|no|de)?\\s*${NIVEL_PT}(?![\\p{L}])`,
    `(?<![\\p{L}])${NIVEL_PT}\\s+esfor[cç]o\\b`,
  ].join('|'),
  'giu',
)
const NIVEL_DE: Record<string, Esforco> = {
  low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', 'x-high': 'xhigh', 'extra high': 'xhigh',
  'extra-high': 'xhigh', max: 'max', maximum: 'max',
  baixo: 'low', medio: 'medium', 'médio': 'medium', alto: 'high', altissimo: 'xhigh', 'altíssimo': 'xhigh',
  'extra alto': 'xhigh', 'extra-alto': 'xhigh', 'muito alto': 'xhigh', maximo: 'max', 'máximo': 'max', 'máx': 'max',
}

/**
 * O nível que a mensagem pede pelo nome ("max effort", "esforço máximo", "máximo esforço"), ou nada.
 * A palavra esforço precisa estar colada ao nível: "um arquivo médio" não pede nada, e
 * "sem esforço máximo" / "don't use max effort" são negações.
 */
export function esforcoPedido(texto: string): Esforco | undefined {
  for (const m of texto.matchAll(PEDIDO)) {
    const antes = texto.slice(Math.max(0, m.index - 20), m.index).toLowerCase()
    if (/(?<![\p{L}'])(not|no|don'?t|never|without|instead of|não|nao|sem|nunca|nada de)(?![\p{L}'])/u.test(antes)) continue
    const nivel = (m.slice(1).find(Boolean) ?? 'xhigh').toLowerCase().replace(/\s+/, ' ')
    const achado = NIVEL_DE[nivel]
    if (achado) return achado
  }
  return undefined
}

const JUIZ_SISTEMA_BASE = `You choose the reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the cheapest effort that will still do the job well.

Effort: low for quick answers, medium for normal work, high for hard problems, xhigh or max only for very hard ones.

Effort is relative to the model in use ("Current" names it): a stronger model needs less effort for the same job. Opus at medium does about what Sonnet does at high. So for one and the same task pick one step lower on Opus than on Sonnet.

Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "go through my whole drive and clean it up", "review the entire repo", "migrate everything", "revisa o projeto inteiro" are big, multi-step, tool-heavy jobs where mistakes are costly: never low, usually high. Low is only for answers that need no tools and no planning.

If the message answers a question in the assistant's last reply (picks an option, says which one, confirms a plan), judge only the work that answer starts, as the reply describes it, not the length of the answer and not the work done before the question: "B" can mean "build the complicated section B" (high), while "yes"/"sim" or "no"/"não" to one small action ("should I archive this?") is low, and picking a value for one setting (a log level, a colour) is low. But picking which way to build something ("option 1", "the same shapes", "B") starts that build: judge the build. Approving a whole plan takes the effort of that plan. A plain "yes", "ok", "pode", "manda" after "Should I build X?" approves building X: judge X, not the word.

A message that pushes back on, corrects or adds to a plan or claim under discussion continues that work: keep at least the effort that work had, never drop to low for it. Thanks, praise or a closing remark with no new request ("valeu", "show", "perfeito") is low. A question about how to do something that needs no tools is low.

If the person asks for deep thought ("think hard", "ultrathink", "be thorough", "pensa bem", "capricha", "com calma"), pick at least high; if they ask for a quick answer ("rapidinho", "só me diz"), pick low.

Messages may be in Portuguese or English; judge them the same way.

Reply with JSON only: {"effort":"low|medium|high|xhigh|max","sure":0.0-1.0 how sure you are,"why":"at most 6 words, in {LANG}"}`

/** O que o juiz lê: o par atual, o fim da conversa e a próxima mensagem. */
export function perguntaJuiz(mensagem: string, modelo: string, esforcoAtual: Esforco, contexto: string, pctContexto?: number): string {
  return [
    `Current: ${familia(modelo)} / ${esforcoAtual}`,
    contexto ? `Recent conversation:\n${contexto}` : '',
    `Next message:\n${mensagem.slice(0, 2000)}`,
    pctContexto !== undefined ? `Context used: ${Math.round(pctContexto)}%` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** `{ effort, sure, why }` de uma resposta do juiz, ou nada se ela não trouxer um. */
export function lerVeredito(texto: string): { esforco: Esforco; certeza?: number; motivo: string } | undefined {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) return undefined
  try {
    const { effort, sure, why } = JSON.parse(m[0]) as Record<string, unknown>
    if (!ESFORCOS.includes(effort as Esforco)) return undefined
    return {
      esforco: effort as Esforco,
      ...(typeof sure === 'number' && sure >= 0 && sure <= 1 ? { certeza: sure } : {}),
      motivo: typeof why === 'string' ? why.slice(0, 60) : '',
    }
  } catch {
    return undefined
  }
}

type Msg = { role: string; text: string }
export const ultimaResposta = (msgs: readonly Msg[]) =>
  [...msgs].reverse().find(m => m.role === 'assistant' && m.text.trim())?.text ?? ''

/** A mensagem anterior do usuário (curta) e o fim da última resposta, onde mora a pergunta com opções. */
export function contextoDe(msgs: readonly Msg[]): string {
  const usuario = [...msgs].reverse().find(m => m.role === 'user' && m.text.trim())
  const resposta = ultimaResposta(msgs)
  return [usuario ? `user: ${usuario.text.slice(0, 400)}` : '', resposta ? `assistant: ${resposta.slice(-2000)}` : '']
    .filter(Boolean)
    .join('\n')
}

export function comAnexos(texto: string, anexos?: readonly { type: string }[]): string {
  if (!anexos?.length) return texto
  const n = new Map<string, number>()
  for (const a of anexos) n.set(a.type, (n.get(a.type) ?? 0) + 1)
  return `${texto}\n\n[The message comes with ${[...n].map(([t, k]) => `${k} ${t}${k > 1 ? 's' : ''}`).join(', ')} to look at.]`
}

export function noMeioDoTurno(texto: string, e: Esforco): string {
  return `${texto}\n\n[Sent while the assistant was still working on the last task at ${e} effort. If it adds to, corrects or steers that task, keep ${e}; judge it on its own only if it is a separate new request.]`
}

// ---------------------------------------------------------------- cache de prompt

export const TTL = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const
export type Ttl = keyof typeof TTL

/** A vida do cache que a resposta gravou, quando ela diz. */
export function ttlDe(uso: unknown): Ttl | undefined {
  const c = (uso as { cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } } | null)
    ?.cache_creation
  if ((c?.ephemeral_1h_input_tokens ?? 0) > 0) return '1h'
  if ((c?.ephemeral_5m_input_tokens ?? 0) > 0) return '5m'
  return undefined
}

/** A maior parte do prompt veio do cache: ele estava quente. */
export function quaseTudoDoCache(uso: unknown): boolean {
  const u = (uso ?? {}) as Uso
  const lido = u.cache_read_input_tokens ?? 0
  const tudo = lido + (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return tudo > 0 && lido / tudo > 0.5
}

/** "42m", "<1m" ou "frio", com minutos arredondados para cima (1 = menos de um). */
export const rotuloCache = (min: number) => (min <= 0 ? T.frio : min === 1 ? '<1m' : `${min - 1}m`)

// ---------------------------------------------------------------- compactação

export const COMPACTAR_SISTEMA = `You compact a conversation between a user and Claude Code, an AI coding agent, so the work can continue
in a fresh context that holds only your summary. Whoever reads it next knows nothing else about the conversation.

Write a detailed summary with these sections:
1. Primary request and intent: everything the user asked for, in detail, including changes of mind.
2. Key technical concepts: technologies, frameworks, constraints and decisions.
3. Files and code: every file read, created or edited, why it matters, and the important snippets or signatures.
4. Errors and fixes: what went wrong, how it was fixed, and any feedback the user gave about it.
5. Problem solving: what was solved and what is still being worked out.
6. All user messages: every message the user wrote that is not a tool result, briefly and in order.
7. Pending tasks: what the user asked for that is not done.
8. Current work: exactly what was being done right before this summary, with file names and code. The last few
messages come nearly uncut: carry the code and errors from them over in full, since the next step builds on them.
9. Next step: the next step, only if it follows directly from the user's latest request, quoting that request.

Keep the plan and which step it is on, the decisions taken with their reasons, and the exact paths of files touched.
Be precise: keep names, paths, numbers, commands and error messages exact. Write in the language the user writes in.
Leave out pleasantries. Reply with the summary only.`

/** Instruções que toda compactação recebe, inclusive a automática e o /compact sem nota. */
export const PRESERVAR =
  'Preserve the current plan and which step it is on, the open tasks, the decisions taken with their reasons, ' +
  'and the exact paths of the files touched. Summarize the rest.'

type MsgCompleta = {
  role: string
  text: string
  toolUses?: readonly { tool: string; input: unknown; text?: string }[]
  toolResults?: readonly { text?: string }[]
}

export const CAUDA = 6
/** A transcrição em texto para o resumidor: as últimas mensagens quase inteiras, o resto cortado. */
export function transcricao(msgs: readonly MsgCompleta[], corteFerramenta = 2000, corteCauda = 20_000): string {
  const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} …[+${s.length - n} caracteres]` : s)
  const inicioCauda = msgs.length - CAUDA
  return msgs
    .map((m, i) => {
      const naCauda = i >= inicioCauda
      const linhas = [`${m.role === 'user' ? 'USER' : 'CLAUDE'}: ${m.text}`.trimEnd()]
      for (const t of m.toolUses ?? []) {
        linhas.push(`  [${t.tool} ${corta(JSON.stringify(t.input ?? {}), naCauda ? corteCauda : 400)}]`)
        if (t.text) linhas.push(`  → ${corta(t.text, naCauda ? corteCauda : corteFerramenta)}`)
      }
      if (!m.toolUses?.length) for (const r of m.toolResults ?? []) if (r.text) linhas.push(`  → ${corta(r.text, naCauda ? corteCauda : corteFerramenta)}`)
      return linhas.join('\n')
    })
    .join('\n\n')
}

/** Cerca de 600k tokens: cabe na janela do Haiku com folga para o resumo. */
export const MAX_CARACTERES = 2_400_000

export type Manifesto = {
  editados: string[]
  tarefas: { texto: string; status: string }[]
  ultimoPedido: string
}

const EDITA = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * O que a compactação não pode perder, tirado da transcrição sem modelo nenhum: os arquivos editados,
 * a última lista de tarefas e o último pedido do usuário, literal. Vai anexado ao resumo do Haiku,
 * que às vezes esquece um caminho ou uma tarefa aberta.
 */
export function manifesto(msgs: readonly MsgCompleta[]): Manifesto {
  const editados: string[] = []
  let tarefas: Manifesto['tarefas'] = []
  const porId = new Map<string, { texto: string; status: string }>()
  for (const m of msgs) {
    for (const t of m.toolUses ?? []) {
      const input = (t.input ?? {}) as Record<string, unknown>
      if (EDITA.has(t.tool)) {
        const p = input.file_path ?? input.notebook_path
        if (typeof p === 'string' && !editados.includes(p)) editados.push(p)
      }
      if (t.tool === 'TodoWrite' && Array.isArray(input.todos)) {
        tarefas = (input.todos as { content?: unknown; status?: unknown }[])
          .filter(x => typeof x.content === 'string')
          .map(x => ({ texto: String(x.content), status: String(x.status ?? 'pending') }))
        porId.clear()
      }
      if (t.tool === 'TaskCreate' && typeof input.subject === 'string') {
        const id = String((t.text ?? '').match(/#?(\d+)/)?.[1] ?? porId.size + 1)
        porId.set(id, { texto: input.subject, status: 'pending' })
      }
      if (t.tool === 'TaskUpdate' && input.taskId !== undefined) {
        const atual = porId.get(String(input.taskId))
        if (atual && typeof input.status === 'string') atual.status = input.status
      }
    }
  }
  if (porId.size) tarefas = [...tarefas, ...porId.values()]
  const pedido = [...msgs].reverse().find(m => m.role === 'user' && m.text.trim() && !m.text.startsWith('<'))
  return { editados, tarefas: tarefas.filter(t => t.status !== 'completed' && t.status !== 'deleted'), ultimoPedido: pedido?.text.trim().slice(0, 1500) ?? '' }
}

/** O resumo com o manifesto embaixo: só o que o resumo não citou, para não repetir. */
export function comManifesto(resumo: string, m: Manifesto): string {
  const faltam = m.editados.filter(p => !resumo.includes(p) && !resumo.includes(p.split('/').pop() ?? p))
  const partes: string[] = []
  if (m.editados.length) {
    partes.push(`${T.rede.editados(m.editados.length)}\n${m.editados.map(p => `- ${p}${faltam.includes(p) ? T.rede.naoCitado : ''}`).join('\n')}`)
  }
  if (m.tarefas.length) partes.push(`${T.rede.tarefas}\n${m.tarefas.map(t => `- [${t.status}] ${t.texto}`).join('\n')}`)
  if (m.ultimoPedido) partes.push(`${T.rede.ultimoPedido}\n> ${m.ultimoPedido.replace(/\n/g, '\n> ')}`)
  if (!partes.length) return resumo
  return `${resumo}\n\n---\n${T.rede.titulo}\n\n${partes.join('\n\n')}`
}

export function mensagemCompactada(resumo: string, porHaiku: boolean): string {
  return (
    'This session is being continued from a previous conversation that ran out of context. The summary below covers ' +
    `the earlier portion of the conversation${porHaiku ? ', written by Haiku 5.5 for the cadence mod' : ''}.\n\n${resumo}\n\n` +
    'Continue the conversation from where it left off without asking the user any further questions.'
  )
}

// ---------------------------------------------------------------- handoff

export const HANDOFF_PROMPT = [
  'Write a handoff so this work can continue in a fresh chat that has no other context.',
  '',
  'Start with the project, its folder and the branch. Then:',
  '- Goal: one or two lines.',
  '- Done: what changed, with file paths, and how each change was checked. Never present something planned, skipped or untested as done.',
  '- Not done: what is half done, and the concrete blocker (a failed check, a missing approval, an open question).',
  '- Git: local changes, local commits, pushed commits and open PRs, as last seen in this chat. You cannot check now, so say "as of last check".',
  '- Next steps in priority order. Make the first one runnable: a file path, a command or a specific decision. Mark every step that needs the user with "needs user".',
  "- To resume: the start command, the preview URL, and the limits on what is allowed (what needs the user's approval, test vs production).",
  '- Do not redo: decisions made and why, approaches that failed.',
  '',
  'Give only the final state of anything that changed during the chat. Point to specs, plans and files instead of ' +
    'copying them. Leave out what is finished and no longer matters. Never include secrets, environment values or raw ' +
    'logs. Write in the language the user writes in. Short bullets, at most about 40 lines. Do not use tools. Reply ' +
    'with the handoff only, no preamble or farewell.',
].join('\n')

export const HANDOFF_COMPLETO_PROMPT = [
  'Write a handoff so this work can continue in a fresh chat that has no other context. You may use tools for this.',
  '',
  '1. Check the real state: git status, the last few commits, whether the branch is pushed, open PRs if gh is set up.',
  '2. Rewrite HANDOFF.md in the project root from scratch (keep it under 80 lines): branch and open PRs, what is half done,',
  '   next steps with the first one runnable, what only the user can do, and pointers to specs, plans and files.',
  '   Never put secrets or environment values in it.',
  '3. Reply with the handoff itself, in the same shape:',
  '',
  HANDOFF_PROMPT.split('\n').slice(2).join('\n').replace('Do not use tools. ', ''),
].join('\n')

export function mensagemHandoff(handoff: string, depois: Config['depoisHandoff'], skill?: string): string {
  const pede = depois === 'wait' ? T.handoff.esperar : T.handoff.continuar
  return skill ? T.handoff.comSkill(skill, handoff.trim(), pede) : T.handoff.simples(handoff.trim(), pede)
}

const CONSELHO_SISTEMA_BASE = `You decide whether the person should hand off now: start a fresh chat that carries over a short summary, instead of carrying on in this one. You are shown what the chat was for, the trail of what the person asked, the last turns, the next message, how full the context is and whether the cache is cold.

Say yes only for a clear reason: the task just finished and the next message is something else, the topic has changed so the old context is dead weight, the chat keeps going in circles on the same problem, or a long chat now holds so much unrelated history that a clean start would be sharper. A normal next step of the same work is never a reason, a long chat by itself is not one, and neither is a high context share when the work is going well. When unsure, say no: a wrong yes costs the person more than a missed one.

Reply with JSON only: {"handoff":"reason of at most 8 words, in {LANG}"} for yes, or {"handoff":null} for no.`

export function evidenciaHandoff(msgs: readonly Msg[], proxima: string, pct: number, frio: boolean): string {
  const pedidos = msgs.filter(m => m.role === 'user' && m.text.trim())
  const primeiro = pedidos[0]?.text.slice(0, 500) ?? ''
  const trilha = pedidos.slice(-8, -1).map(m => `- ${m.text.slice(0, 160).replace(/\s+/g, ' ')}`)
  const resposta = ultimaResposta(msgs).slice(-700)
  return [
    primeiro ? `What the chat was for (first message):\n${primeiro}` : '',
    trilha.length ? `Trail of earlier messages:\n${trilha.join('\n')}` : '',
    resposta ? `The assistant's last reply (its end):\n${resposta}` : '',
    `Next message:\n${proxima.slice(0, 600)}`,
    `Context used: ${Math.round(pct)}% of the budget; ${pedidos.length} messages so far; the cache is ${frio ? 'cold' : 'warm'}.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function lerConselho(texto: string): string | null {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const { handoff } = JSON.parse(m[0]) as { handoff?: unknown }
    return typeof handoff === 'string' && handoff.trim() ? handoff.trim().slice(0, 70) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- barra

export const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const fmtUsd = (n: number) => (n >= 1 ? `US$ ${n.toFixed(2)}` : `US$ ${n.toFixed(3)}`)

/**
 * Verde até `verdeAte`, vermelho em `vermelhoEm`. A curva t^1.6 segura o amarelo/laranja e deixa
 * o vermelho forte só perto do fim.
 */
export function cor(tokens: number, verdeAte: number, vermelhoEm: number): string {
  const lin = Math.min(Math.max((tokens - verdeAte) / Math.max(1, vermelhoEm - verdeAte), 0), 1)
  const hue = 120 * (1 - lin ** 1.6)
  const l = 0.5
  const a = 0.85 * Math.min(l, 1 - l)
  const k = (n: number) => (n + hue / 30) % 12
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

/** Quantos quadradinhos de 1 célula a barra leva: 10 numa tela larga, 8 em 80 colunas, 6 abaixo disso. */
export const celulas = (colunas: number) => (colunas >= 110 ? 10 : colunas >= 70 ? 8 : 6)

/** "14:20" hoje, "seg 14:20" mais longe. */
export function rotuloReset(iso: string | null | undefined, agora: number): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.getTime() - agora < 20 * 3600_000 ? hm : `${T.dias[d.getDay()]} ${hm}`
}

// ---------------------------------------------------------------- relatórios

const quemJulgou = (por: Gasto['juiz']['por']) =>
  (['local', 'jev', 'haiku'] as const)
    .filter(k => por[k])
    .map(k => `${por[k]} ${T.porQuem[k]}`)
    .join(', ') || 'Haiku'

export function textoGasto(g: Gasto, sessaoUsd?: number): string {
  const linhas: string[] = []
  if (sessaoUsd !== undefined) linhas.push(T.gasto.sessao(fmtUsd(sessaoUsd)))
  linhas.push(T.gasto.auto(g.prompts, g.requisicoes, fmtUsd(g.usd)))
  for (const e of ESFORCOS) {
    const b = g.porEsforco[e]
    if (b) linhas.push(T.gasto.linhaEsforco(NOME_ESFORCO[e], b.prompts, fmtUsd(b.usd)))
  }
  const j = g.juiz
  if (j.vezes || j.seguimentos || j.pedidos)
    linhas.push(T.gasto.juizes(j.vezes, quemJulgou(j.por), j.vezes ? Math.round(j.ms / j.vezes) : 0, fmtUsd(j.usd), j.seguimentos, j.pedidos, j.falhas))
  const c = g.compactacoes
  if (c.haiku || c.sessao || c.falhas) {
    linhas.push(T.gasto.compactacoes(c.haiku, c.sessao, c.falhas, fmtK(c.antes), fmtK(c.depois)))
    if (c.haiku) linhas.push(T.gasto.economiaCompactar(fmtUsd(c.usd), fmtUsd(c.usdSessaoEstimado)))
  }
  if (g.handoffs) linhas.push(T.gasto.handoffs(g.handoffs))
  const subs = ESFORCOS.filter(e => g.subagentes[e])
  if (subs.length)
    linhas.push(T.gasto.subagentes(subs.reduce((n, e) => n + (g.subagentes[e] ?? 0), 0), subs.map(e => `${NOME_ESFORCO[e]} ${g.subagentes[e]}`).join(', ')))
  return linhas.join('\n')
}

export function textoEconomia(g: Gasto): string {
  const c = g.compactacoes
  const livres = c.antes - c.depois
  const abaixo = (g.porEsforco.low?.prompts ?? 0) + (g.porEsforco.medium?.prompts ?? 0)
  if (!c.haiku && !abaixo) return T.economia.nada
  const linhas = [T.economia.titulo]
  if (c.haiku && livres > 0)
    linhas.push(T.economia.tokens(fmtK(livres), fmtK(c.antes), fmtK(c.depois), Math.round((livres / c.antes) * 100)))
  if (c.haiku && c.usdSessaoEstimado > c.usd)
    linhas.push(T.economia.dolares(fmtUsd(c.usd), fmtUsd(c.usdSessaoEstimado), fmtUsd(c.usdSessaoEstimado - c.usd)))
  if (abaixo) linhas.push(T.economia.esforco(abaixo, g.prompts))
  return linhas.join('\n')
}

export type CasoBench = { id: string; kind: string; holdout?: boolean; lang?: string; current: { model: string; effort: Esforco }; context?: string; message: string; ok: Esforco[] }
export type RespostaBench = { id: string; esforco?: Esforco; por: Escolha['por'] | 'nenhum'; ms: number }

export function notaBench(c: CasoBench, e: Esforco | undefined): 'acerto' | 'baixo' | 'alto' | 'nada' {
  if (!e) return 'nada'
  if (c.ok.includes(e)) return 'acerto'
  return ESFORCOS.indexOf(e) < Math.min(...c.ok.map(x => ESFORCOS.indexOf(x))) ? 'baixo' : 'alto'
}

export function relatorioBench(casos: CasoBench[], respostas: RespostaBench[]): string {
  const porId = new Map(casos.map(c => [c.id, c]))
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
  const grupo = (nome: string, rs: RespostaBench[]) => {
    const n = rs.map(r => notaBench(porId.get(r.id)!, r.esforco))
    const ms = rs.filter(r => r.por === 'haiku' || r.por === 'jev' || r.por === 'local').map(r => r.ms).sort((a, b) => a - b)
    return `| ${nome} | ${rs.length} | ${pct(n.filter(x => x === 'acerto').length, rs.length)} | ${n.filter(x => x === 'baixo').length} | ${n.filter(x => x === 'alto').length} | ${n.filter(x => x === 'nada').length} | ${ms.length ? `${ms[Math.floor(ms.length / 2)]} ms` : '-'} |`
  }
  const de = (f: (c: CasoBench) => boolean) => respostas.filter(r => f(porId.get(r.id)!))
  const erros = respostas
    .filter(r => notaBench(porId.get(r.id)!, r.esforco) !== 'acerto')
    .map(r => {
      const c = porId.get(r.id)!
      return T.bench.erro(c.id, `${c.kind}${c.lang === 'pt' ? ', pt' : ''}`, r.esforco ?? T.bench.nada, c.ok.join('/'), c.message.slice(0, 70))
    })
  return [
    T.bench.cabecalho,
    '| --- | --- | --- | --- | --- | --- | --- |',
    grupo(T.bench.todos, respostas),
    grupo(T.bench.holdout, de(c => !!c.holdout)),
    grupo(T.bench.portugues, de(c => c.lang === 'pt')),
    '',
    T.bench.quem(`${(['local', 'jev', 'haiku', 'pedido', 'seguimento', 'nenhum'] as const)
      .map(k => [k, respostas.filter(r => r.por === k).length] as const)
      .filter(([, n]) => n)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}`),
    '',
    erros.length ? `${T.bench.erros}\n${erros.join('\n')}` : T.bench.nenhumErro,
  ].join('\n')
}

/** The judge's system prompt, asking for the "why" in the band's language. */
export const juizSistema = () => JUIZ_SISTEMA_BASE.replace('{LANG}', T.idiomaModelo)
/** The handoff advisor's system prompt, the reason in the band's language. */
export const conselhoSistema = () => CONSELHO_SISTEMA_BASE.replace('{LANG}', T.idiomaModelo)
