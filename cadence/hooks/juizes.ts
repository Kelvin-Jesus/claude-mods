// Os juízes rápidos além do Haiku: o Jev (TypeSafe, na nuvem), o mesmo contrato servido na máquina,
// e qualquer modelo local que fale a API de chat da OpenAI (Ollama, llama.cpp, LM Studio).
// Tudo aqui é puro: monta o pedido e lê a resposta; quem faz a chamada é o register.

import type { Esforco, ModoJuiz, NomeJuiz } from '../types'
import { ESFORCOS, familia, juizSistema, lerVeredito } from './logica'
import { T } from './textos'

export type Veredito = { esforco: Esforco; certeza?: number; motivo: string }
/** O juiz respondeu, mas em dúvida: quem decide é o Haiku. */
export const INCERTO = 'incerto' as const

/** As opções do Jev para a pergunta de esforço, cada uma com o que ela cobre. */
export const CRITERIOS: Record<Esforco, string> = {
  low: 'quick answer, no tools, no planning',
  medium: 'normal work: a few tool calls or edits',
  high: 'hard or large multi-step job: many tool calls, costly mistakes',
  xhigh: 'very hard: a long investigation',
  max: 'the hardest research-level work',
}

export const TAREFA =
  'Choose the reasoning effort an agentic assistant should use for the next user message. It reads files, ' +
  'runs tools and edits things, not only code. Pick the cheapest that still does the job well. Judge the scope and the ' +
  'amount of work, not whether it is code: "go through my whole drive and clean it up" or "revisa o projeto inteiro" is a ' +
  'big tool-heavy job. Effort is relative to current_model: Opus at medium does about what Sonnet does at high, so for ' +
  'one task pick one step lower on Opus than on Sonnet. A short follow-up ("yes", "go", "ok", "sim", "segue") keeps the ' +
  "current effort. When the message answers a question in the assistant's last reply (picks an option), judge only the " +
  'work that answer starts: yes/no to one small action, or picking a value for one setting, is low; picking which way to ' +
  'build something starts that build, so judge the build; approving a whole plan takes the effort of that plan. Pushing ' +
  'back on or adding to a plan under discussion continues that work: keep its effort, never low. Thanks or a closing ' +
  'remark with no new request is low. "think hard", "pensa bem" or "be thorough" means at least high; "quick question" ' +
  'or "rapidinho" means low. Messages may be in Portuguese or English.'

export type Estado = { modelo: string; esforco: Esforco; contexto: string; mensagem: string }

/** O corpo do `systemone`: o estado da conversa e uma pergunta de escolha com os critérios. */
export function corpoSystemone(modelo: string, e: Estado): string {
  return JSON.stringify({
    model: modelo,
    state: {
      task: TAREFA,
      current_model: familia(e.modelo),
      current_effort: e.esforco,
      recent_conversation: e.contexto,
      next_message: e.mensagem.slice(0, 4000),
    },
    questions: {
      effort: { type: 'choice', instructions: 'Which effort fits the next message?', criteria: CRITERIOS },
    },
  })
}

/**
 * A resposta do `systemone`: `answers.effort.choice` e a confiança (ou a probabilidade da escolha).
 * Abaixo de 50% o juiz está em dúvida e o Haiku decide.
 */
export function lerSystemone(texto: string): Veredito | typeof INCERTO | undefined {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(texto) as Record<string, unknown>
  } catch {
    return undefined
  }
  const respostas = (json.answers ?? (json.result as Record<string, unknown> | undefined)?.answers) as
    | Record<string, { choice?: string; confidence?: number; probabilities?: Record<string, number> }>
    | undefined
  const esforco = respostas?.effort?.choice as Esforco | undefined
  if (!esforco || !ESFORCOS.includes(esforco)) return undefined
  const certeza = respostas?.effort?.confidence ?? respostas?.effort?.probabilities?.[esforco]
  if (typeof certeza === 'number' && certeza < 0.5) return INCERTO
  return typeof certeza === 'number'
    ? { esforco, certeza, motivo: T.certeza(Math.round(certeza * 100)) }
    : { esforco, motivo: '' }
}

const ESQUEMA = {
  type: 'object',
  properties: {
    effort: { type: 'string', enum: ESFORCOS },
    sure: { type: 'number' },
    why: { type: 'string' },
  },
  required: ['effort', 'sure', 'why'],
} as const

/**
 * Chat completions no formato da OpenAI, com saída presa a um JSON Schema: o Ollama, o llama-server
 * e o LM Studio aceitam `response_format: { type: 'json_schema' }`, o que mantém modelos pequenos
 * dentro do formato.
 */
export function corpoOpenAI(modelo: string, pergunta: string): string {
  return JSON.stringify({
    model: modelo,
    temperature: 0,
    max_tokens: 120,
    stream: false,
    messages: [
      { role: 'system', content: juizSistema() },
      { role: 'user', content: pergunta },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'effort', strict: true, schema: ESQUEMA } },
  })
}

export function lerOpenAI(texto: string): Veredito | undefined {
  try {
    const json = JSON.parse(texto) as { choices?: { message?: { content?: string } }[] }
    const conteudo = json.choices?.[0]?.message?.content
    return typeof conteudo === 'string' ? lerVeredito(conteudo) : undefined
  } catch {
    return undefined
  }
}

/** A chave da TypeSafe num `.env` (TYPESAFE_API_KEY=...), o mesmo arquivo que as skills do jev leem. */
export function chaveDoEnv(texto: string): string | undefined {
  const v = texto.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '')
  return v || undefined
}

/** Why a judge failed, in words. */
export const porQueFalhou = (nome: string, status: number | 'tempo' | 'rede') => T.porQueFalhou(nome, status)

// ---------------------------------------------------------------- qual juiz

export type { ModoJuiz, NomeJuiz }
export const MODOS_JUIZ: readonly ModoJuiz[] = ['auto', 'haiku', 'jev', 'local']

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
export const JEV_MODELO = 'jev-latest'
/** O Jev responde em ~300 ms; passou disto, o Haiku decide. */
export const TEMPO_JEV = 3000
/** Um modelo local pode estar carregando do disco na primeira chamada. */
export const TEMPO_LOCAL = 8000
/** Ollaya's daemon on its default port: what `judge: local` uses with no URL. */
export const OLLAYA_URL = 'http://127.0.0.1:11435'
/** Laya multilingual: 322M, answers in about half a second on a CPU, and reads Portuguese. */
export const OLLAYA_MODELO = 'laya:multilingual'

/**
 * A fila de juízes. O Haiku fecha toda fila: só precisa do login da sessão.
 * No auto, o local vem primeiro quando há URL (grátis e offline), depois o Jev quando há chave.
 */
export function ordemJuizes(modo: ModoJuiz, temLocal: boolean, temChave: boolean): NomeJuiz[] {
  if (modo === 'haiku') return ['haiku']
  if (modo === 'jev') return ['jev', 'haiku']
  if (modo === 'local') return ['local', 'haiku']
  return [...(temLocal ? (['local'] as const) : []), ...(temChave ? (['jev'] as const) : []), 'haiku']
}

/**
 * Where the local judge goes and in which format. Decision models are the default: Ollaya (and Ollama 0.40+,
 * laya-serve) serve them behind Jev's `/v1/systemone`, so a bare base URL gets that path. Only a URL that ends in
 * `chat/completions` goes to a chat model through the OpenAI API (llama-server, LM Studio, vLLM).
 */
export function destinoLocal(url: string): { url: string; formato: 'systemone' | 'openai' } {
  const base = (url.trim() || OLLAYA_URL).replace(/\/+$/, '')
  if (/chat\/completions$/.test(base)) return { url: base, formato: 'openai' }
  if (/systemone$/.test(base)) return { url: base, formato: 'systemone' }
  return { url: `${base.replace(/\/v1$/, '')}/v1/systemone`, formato: 'systemone' }
}

/** O modelo que vai no corpo: o configurado, ou Laya multilingual no contrato do Jev. */
export const modeloLocal = (modelo: string, formato: 'systemone' | 'openai') => modelo.trim() || (formato === 'systemone' ? OLLAYA_MODELO : '')

export const NOME_JUIZ: Record<NomeJuiz, string> = new Proxy({} as Record<NomeJuiz, string>, { get: (_, k) => T.juiz[k as NomeJuiz] })
