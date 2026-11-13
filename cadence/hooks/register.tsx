import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, Elements, EngineInterface, ModelForkResult, Register, SessionMessage, SessionRateLimit, UiPressArgument } from 'claude-code'

import type { Ctx, Escolha, Esforco, Fechados, Gasto, Limite } from '../types'
import {
  acima,
  celulas,
  comAnexos,
  comManifesto,
  comoGasto,
  contagem,
  COMPACTAR_SISTEMA,
  conselhoSistema,
  contextoDe,
  cor,
  dolares,
  economizado,
  ehSeguimento,
  esforcoPedido,
  evidenciaHandoff,
  familia,
  fmtK,
  GASTO_VAZIO,
  HAIKU,
  HANDOFF_COMPLETO_PROMPT,
  HANDOFF_PROMPT,
  inclinado,
  juizSistema,
  lerConfig,
  lerConselho,
  lerVeredito,
  limitado,
  mantemEsforco,
  manifesto,
  MAX_CARACTERES,
  mensagemCompactada,
  mensagemHandoff,
  mensagemSubagente,
  esforcoDoSubagente,
  noMeioDoTurno,
  NOME_ESFORCO,
  perguntaJuiz,
  pisoAjudante,
  PRECO,
  PRESERVAR,
  quaseTudoDoCache,
  relatorioBench,
  rotuloCache,
  rotuloReset,
  semEsforco,
  cacheSeguro,
  textoGasto,
  textoEconomia,
  transcricao,
  TTL,
  ttlDe,
  type CasoBench,
  type Config,
  type RespostaBench,
  type Ttl,
} from './logica'
import {
  chaveDoEnv,
  corpoOpenAI,
  corpoSystemone,
  destinoLocal,
  INCERTO,
  JEV_MODELO,
  JEV_URL,
  lerOpenAI,
  lerSystemone,
  MODOS_JUIZ,
  modeloLocal,
  NOME_JUIZ,
  ordemJuizes,
  porQueFalhou,
  TEMPO_JEV,
  TEMPO_LOCAL,
  type Estado,
  type ModoJuiz,
  type NomeJuiz,
  type Veredito,
} from './juizes'
import { T, usarLingua } from './textos'
import { barraAscii, barraFina, cabe, GLIFO, nivelCache, nivelPct, NIVEL_ESFORCO, PILULA, porExtenso, TRACO, TRILHO, TRACO_BARRA, svgAnel, svgCache, svgMedidor, TEMA, type Nivel } from './visual'

const P = 'cadence' as const
const ctx = atom({ plugin: 'cadence', key: 'ctx' } as const, { tokens: null, janela: 350_000 } as Ctx)
const limites = atom({ plugin: 'cadence', key: 'limites' } as const, [] as Limite[])
const auto = atom({ plugin: 'cadence', key: 'auto' } as const, true)
const escolha = atom({ plugin: 'cadence', key: 'escolha' } as const, null as Escolha | null)
const julgando = atom({ plugin: 'cadence', key: 'julgando' } as const, false)
const pausado = atom({ plugin: 'cadence', key: 'pausado' } as const, false)
const cacheMin = atom({ plugin: 'cadence', key: 'cacheMin' } as const, null as number | null)
const cacheMemo = atom({ plugin: 'cadence', key: 'cacheMemo' } as const, null as { expira: number; ttl: Ttl } | null)
const compactaEm = atom({ plugin: 'cadence', key: 'compactaEm' } as const, null as number | null)
const conselho = atom({ plugin: 'cadence', key: 'conselho' } as const, null as string | null)
const economiaAte = atom({ plugin: 'cadence', key: 'economiaAte' } as const, null as number | null)
const etapa = atom({ plugin: 'cadence', key: 'etapa' } as const, null as 'escrevendo' | 'limpando' | 'compactando' | null)
const FECHADOS_VAZIO: Fechados = { frio: false, pantanoAte: null, conselho: null, quente: null }
const fechados = atom({ plugin: 'cadence', key: 'fechados' } as const, FECHADOS_VAZIO)
const gasto = atom({ plugin: 'cadence', key: 'gasto' } as const, GASTO_VAZIO)
const rotasUi = atom({ plugin: 'cadence', key: 'rotas' } as const, {} as Record<string, { esforco: Esforco; motivo: string }>)

/** Abaixo disto um cache frio custa pouco: a próxima mensagem relê o chat a preço cheio uma vez só. */
const FRIO_MIN = 100_000
/** O aviso de contexto pesado fechado volta quando o contexto cresce mais isto. */
const PANTANO_REVOLTA = 50_000
const QUENTE_PCT = 80
/** Os últimos minutos antes da compactação por ociosidade aparecem na barra. */
const AVISO_OCIOSO_MIN = 15
/** O conselho de handoff roda a partir desta fração do orçamento, a cada N mensagens. */
const CONSELHO_DESDE = 30
const CONSELHO_CADA = 2
const TICK_MS = 1000

type $ = EngineInterface

let config: Config = lerConfig({})

// Variáveis do módulo: um reload começa de novo, o estado ($.state) fica.
let relogio = false
let trabalhando = false
let ociosoDesde: number | null = null
let motorEsforco: string | undefined
let segurada: Escolha | null = null
let cacheExpira = 0
let cacheTtl: Ttl = '1h'
// TERM=dumb: a barra troca os glifos Unicode por ASCII.
let ascii = false
let ultimaRespostaEm: number | undefined
let conselhoContador = 0
/** O esforço escolhido para cada subagente, pelo id do loop dele. */
const rotas = new Map<string, Escolha | undefined>()
let handoff: { fila: boolean; completo: boolean; depois: Config['depoisHandoff']; texto?: string; dirigindo: boolean } = {
  fila: false,
  completo: false,
  depois: config.depoisHandoff,
  dirigindo: false,
}

const somar = ($: $, f: (g: Gasto) => Gasto) => update($, gasto, g => f(comoGasto(g)))
const avisar = ($: $, texto: string) => $.ui.toast(`cadence: ${texto}`)

// ------------------------------------------------------------ uso, contexto e limites

const guardarUso = async ($: $, c: { tokens?: number }, rl: readonly SessionRateLimit[]) => {
  await update($, ctx, () => ({ tokens: c.tokens ?? null, janela: config.janela }))
  const ls = rl
    .filter(r => r.kind === 'five_hour' || r.kind === 'seven_day')
    .map(r => ({ kind: r.kind, pct: r.percentUsed, resetsAt: r.resetsAt ?? null }))
  await update($, limites, antigo => (JSON.stringify(antigo) === JSON.stringify(ls) ? antigo : ls))
  const ate = await read($, economiaAte)
  if (ate !== null && (await $.clock.now()) >= ate) {
    await update($, economiaAte, () => null)
    avisar($, T.limiteRenovou)
  }
}

// ------------------------------------------------------------ cache de prompt

const lembrarCache = ($: $) => update($, cacheMemo, () => (cacheExpira > 0 ? { expira: cacheExpira, ttl: cacheTtl } : null))

const mostrarCache = async ($: $) => {
  if (cacheExpira === 0) {
    if ((await read($, cacheMin)) !== null) await update($, cacheMin, () => null)
    return
  }
  const resta = cacheExpira - (await $.clock.now())
  const min = resta <= 0 ? 0 : Math.ceil(resta / 60_000)
  const antes = await read($, cacheMin)
  if (min === antes) return
  await update($, cacheMin, () => min)
  if (min === 0 && antes !== 0) await update($, fechados, f => ({ ...f, frio: false }))
}

/** Uma resposta da conversa principal voltou: o cache esquentou por toda a sua vida. */
const cacheTocado = async ($: $, uso: unknown) => {
  const agora = await $.clock.now()
  // Sem a resposta dizer, o próprio cache conta: lido depois de mais de 5 minutos, a vida é de 1 hora.
  const ttl = ttlDe(uso) ?? (ultimaRespostaEm !== undefined && agora - ultimaRespostaEm > TTL['5m'] && quaseTudoDoCache(uso) ? '1h' : undefined)
  ultimaRespostaEm = agora
  // Uma resposta que gravou só uma ponta de 5 minutos ainda lê o resto do cache de 1 hora.
  if (ttl && ttl !== cacheTtl && !(ttl === '5m' && cacheTtl === '1h' && quaseTudoDoCache(uso))) cacheTtl = ttl
  cacheExpira = agora + TTL[cacheTtl]
  await lembrarCache($)
  await mostrarCache($)
}

const cacheEsfriado = async ($: $) => {
  cacheExpira = 0
  await lembrarCache($)
  await update($, cacheMin, () => null)
}

// ------------------------------------------------------------ juiz de esforço

/** O Haiku pelo login da própria sessão: nenhuma chave. */
const perguntarHaiku = async ($: $, system: string, prompt: string, maxTokens: number, timeoutMs: number) => {
  const pede = (model: string) => $.model.complete({ model, system, prompt, maxTokens, effort: 'low', timeoutMs })
  let r = await pede(HAIKU)
  // Builds antigos não conhecem o 5.5 pelo nome: o apelido segura.
  if (!r.isAnswered && r.reason === 'api-error') r = await pede('haiku')
  return r
}

// ------------------------------------------------------------ juízes rápidos (Jev e local)

let chaveJev: Promise<string | undefined> | undefined
/** A chave da TypeSafe: a das opções, a do ambiente, ou ~/.config/jev/.env só quando o Jev foi escolhido de propósito. */
const acharChave = ($: $) =>
  (chaveJev ??= (async () => {
    if (config.typesafeKey) return config.typesafeKey
    const doAmbiente = await $.env.get('TYPESAFE_API_KEY').catch(() => undefined)
    if (doAmbiente) return doAmbiente
    if (config.juiz !== 'jev') return undefined
    const home = await $.env.get('HOME').catch(() => undefined)
    return home ? chaveDoEnv(await $.fs.read(`${home}/.config/jev/.env`).catch(() => '')) : undefined
  })())

// Um juiz fora do ar avisa uma vez, até voltar a responder.
const foraDoAr: Partial<Record<NomeJuiz, boolean>> = {}
const falhou = ($: $, nome: NomeJuiz, motivo: string) => {
  if (!foraDoAr[nome]) avisar($, T.falhouJuiz(motivo))
  foraDoAr[nome] = true
}

/** Um juiz rápido: o veredito, `INCERTO` quando ele mesmo está em dúvida, ou nada quando falha. Nunca lança. */
const perguntarRapido = async ($: $, nome: 'jev' | 'local', estado: Estado, pergunta: string): Promise<Veredito | typeof INCERTO | undefined> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  let url = JEV_URL
  let formato: 'systemone' | 'openai' = 'systemone'
  let corpo: string
  if (nome === 'jev') {
    const chave = await acharChave($)
    if (!chave) {
      falhou($, nome, T.semChave)
      return undefined
    }
    headers.authorization = `Bearer ${chave}`
    corpo = corpoSystemone(JEV_MODELO, estado)
  } else {
    const destino = destinoLocal(config.juizUrl)
    url = destino.url
    formato = destino.formato
    const modelo = modeloLocal(config.juizModelo, formato)
    if (formato === 'systemone') headers.authorization = 'Bearer local'
    corpo = formato === 'systemone' ? corpoSystemone(modelo, estado) : corpoOpenAI(modelo, pergunta)
  }
  try {
    const r = await Promise.race([
      $.http.fetch(url, { method: 'POST', headers, body: corpo }),
      $.clock.sleep(nome === 'jev' ? TEMPO_JEV : TEMPO_LOCAL).then(() => 'tempo' as const),
    ])
    if (r === 'tempo') return void falhou($, nome, porQueFalhou(NOME_JUIZ[nome], 'tempo'))
    if (!r.ok) return void falhou($, nome, porQueFalhou(NOME_JUIZ[nome], r.status))
    const v = formato === 'systemone' ? lerSystemone(r.text) : lerOpenAI(r.text)
    if (v === undefined) return void falhou($, nome, T.foraDoFormato(NOME_JUIZ[nome]))
    foraDoAr[nome] = false
    return v
  } catch {
    return void falhou($, nome, porQueFalhou(NOME_JUIZ[nome], 'rede'))
  }
}

/** Uma linha dizendo quem decide agora e por quê. */
const descreverJuiz = (temChave: boolean) => {
  const ordem = ordemJuizes(config.juiz, Boolean(config.juizUrl), temChave)
  const local = destinoLocal(config.juizUrl)
  const onde = (n: NomeJuiz) =>
    n === 'local' ? `local (${local.url}${modeloLocal(config.juizModelo, local.formato) ? `, ${modeloLocal(config.juizModelo, local.formato)}` : ''})` : NOME_JUIZ[n]
  return `${config.juiz}: ${ordem.map(onde).join(' → ')}`
}

/** /cadence juiz: pergunta a cada juiz da fila uma coisa pequena e diz quanto demorou, ou por que falhou. */
const testarJuizes = async ($: $) => {
  const temChave = config.juiz !== 'haiku' && Boolean(await acharChave($))
  const ordem = config.juiz === 'auto' ? ordemJuizes('auto', Boolean(config.juizUrl), temChave) : ordemJuizes(config.juiz, true, true)
  const mensagem = 'rename one variable in a single file'
  const linhas = [T.testeJuiz.titulo(descreverJuiz(temChave))]
  for (const nome of ordem) {
    const inicio = await $.clock.now()
    let resultado: string
    if (nome === 'haiku') {
      const r = await perguntarHaiku($, juizSistema(), perguntaJuiz(mensagem, 'claude-opus-5-5', 'medium', ''), 200, 10_000)
      const v = r.isAnswered ? lerVeredito(r.text) : undefined
      resultado = v ? T.testeJuiz.respondeu(NOME_ESFORCO[v.esforco]) : T.testeJuiz.falhou(r.isAnswered ? T.testeJuiz.foraDoFormato : r.reason)
    } else {
      foraDoAr[nome] = false
      const v = await perguntarRapido($, nome, { modelo: 'claude-opus-5-5', esforco: 'medium', contexto: '', mensagem }, perguntaJuiz(mensagem, 'claude-opus-5-5', 'medium', ''))
      resultado = v === INCERTO ? T.testeJuiz.duvida : v ? T.testeJuiz.respondeu(NOME_ESFORCO[v.esforco]) : T.testeJuiz.falhouAviso
    }
    linhas.push(`  ${NOME_JUIZ[nome].padEnd(11)} ${resultado}, ${(await $.clock.now()) - inicio} ms`)
  }
  return linhas.join('\n')
}

type Julgado = { veredito?: Veredito; por: NomeJuiz; usd: number; falhas: number }

/** A fila de juízes: o local e o Jev primeiro quando há, o Haiku fecha. Usado pelo prompt real e pelo bench. */
const julgarCom = async ($: $, modo: ModoJuiz, mensagem: string, modelo: string, atual: Esforco, contexto: string, pct: number | undefined, prazoHaiku: number): Promise<Julgado> => {
  const pergunta = perguntaJuiz(mensagem, modelo, atual, contexto, pct)
  const temChave = modo !== 'haiku' && modo !== 'local' && Boolean(await acharChave($))
  let falhas = 0
  for (const nome of ordemJuizes(modo, Boolean(config.juizUrl), temChave)) {
    if (nome === 'haiku') break
    const v = await perguntarRapido($, nome, { modelo, esforco: atual, contexto, mensagem }, pergunta)
    if (v && v !== INCERTO) return { veredito: v, por: nome, usd: 0, falhas }
    if (v === undefined) falhas++
  }
  let r = await perguntarHaiku($, juizSistema(), pergunta, 200, prazoHaiku)
  let usd = r.usage ? dolares(r.usage, HAIKU) : 0
  // Respondeu sem um JSON legível: uma segunda chance custa centavos de centavo.
  if (r.isAnswered && !lerVeredito(r.text)) {
    r = await perguntarHaiku($, juizSistema(), `${pergunta}\n\nReply with the JSON object only.`, 200, prazoHaiku)
    usd += r.usage ? dolares(r.usage, HAIKU) : 0
  }
  return { veredito: r.isAnswered ? lerVeredito(r.text) : undefined, por: 'haiku', usd, falhas }
}

/** `subagente`: a tarefa roda num loop sem a conversa, então o juiz não lê a conversa nem o contexto usado. */
const julgar = async ($: $, mensagem: string, modelo: string, atual: Esforco, subagente = false) => {
  const msgs = subagente ? [] : await $.session.messages().catch(() => [] as SessionMessage[])
  const c = await read($, ctx)
  const pct = !subagente && c.tokens !== null ? (c.tokens / c.janela) * 100 : undefined
  const inicio = await $.clock.now()
  const j = await julgarCom($, config.juiz, mensagem, modelo, atual, contextoDe(msgs), pct, 6000)
  const ms = (await $.clock.now()) - inicio
  const ok = j.veredito !== undefined
  await somar($, g => ({
    ...g,
    juiz: {
      ...g.juiz,
      vezes: g.juiz.vezes + (ok ? 1 : 0),
      ms: g.juiz.ms + (ok ? ms : 0),
      usd: g.juiz.usd + j.usd,
      por: ok ? { ...g.juiz.por, [j.por]: (g.juiz.por[j.por] ?? 0) + 1 } : g.juiz.por,
      falhas: g.juiz.falhas + j.falhas,
    },
  }))
  return { veredito: j.veredito, por: j.por, ms }
}

/** Aplica a escolha; no meio de um turno, uma escolha menor espera o turno acabar para não cortar o esforço dele. */
const aplicar = async ($: $, nova: Escolha, meioTurno: boolean) => {
  const atual = await read($, escolha)
  if (meioTurno && atual && acima(atual.esforco, nova.esforco)) {
    segurada = nova
    return
  }
  segurada = null
  await update($, escolha, () => nova)
  await somar($, g => {
    const b = g.porEsforco[nova.esforco] ?? { prompts: 0, usd: 0 }
    return { ...g, prompts: g.prompts + 1, porEsforco: { ...g.porEsforco, [nova.esforco]: { ...b, prompts: b.prompts + 1 } } }
  })
}

/** O que a mensagem vira, sem aplicar: o mesmo caminho do prompt real, usado também pelo /cadence bench. */
/** `bruto` é o que a pessoa digitou; `lido` é o que o juiz lê (com anexos, skill ou o aviso de meio de turno). */
const decidir = async ($: $, bruto: string, lido: string, modelo: string, atual: Escolha | null, contexto: string, novoTrabalho: boolean): Promise<Escolha | undefined> => {
  const pedido = esforcoPedido(bruto)
  if (pedido) return { esforco: pedido, motivo: T.motivoPedido, por: 'pedido' }
  if (atual && atual.por !== 'manual' && !novoTrabalho && mantemEsforco(bruto, contexto)) return { ...atual, por: 'seguimento', motivo: T.motivoSeguindo }
  const { veredito, por } = await julgar($, lido, modelo, atual?.esforco ?? 'medium')
  if (!veredito) return undefined
  const ajustado = limitado(inclinado(veredito.esforco, veredito.certeza, config.vies), config.piso, config.teto)
  const economia = (await read($, economiaAte)) !== null
  const final = economizado(ajustado, economia)
  const motivo = final !== ajustado ? T.motivoEconomia : ajustado !== veredito.esforco ? T.motivoLimites : veredito.motivo
  return { esforco: final, motivo, por, certeza: veredito.certeza }
}

/** O esforço de um subagente que vai nascer: o mesmo juiz do prompt, lendo só a tarefa dele. */
const rotear = async ($: $, e: AgentSpawnInput): Promise<Escolha | undefined> => {
  const modelo = e.model ?? e.parentModel
  if (semEsforco(modelo) || !e.prompt.trim()) return undefined
  const principal = await read($, escolha)
  if (principal?.por === 'manual') return undefined
  const pedido = esforcoPedido(e.prompt)
  const julgado =
    principal?.por === 'pedido' || pedido
      ? undefined
      : await julgar($, mensagemSubagente(e.subagentType, e.description, e.prompt), modelo, principal?.esforco ?? 'medium', true)
  const final = esforcoDoSubagente({
    principal,
    pedido,
    veredito: julgado?.veredito,
    config,
    economia: (await read($, economiaAte)) !== null,
    porJuiz: julgado?.por,
  })
  if (!final) return undefined
  await somar($, g => ({ ...g, subagentes: { ...g.subagentes, [final.esforco]: (g.subagentes[final.esforco] ?? 0) + 1 } }))
  if (e.tool_use_id) await update($, rotasUi, m => ({ ...m, [e.tool_use_id]: { esforco: final.esforco, motivo: final.motivo } }))
  return final
}

/** A skill ou comando do usuário que "/nome args" roda; nada para os comandos do próprio app. */
const skillDigitada = async ($: $, texto: string) => {
  const nome = texto.trim().slice(1).split(/\s+/)[0]
  if (!nome || nome === P) return undefined
  const achado = (await $.command.list().catch(() => [])).find(c => c.name === nome)
  if (!achado || !['user', 'plugin', 'mcp'].includes(achado.source)) return undefined
  return { nome, descricao: achado.description ?? '' }
}

// ------------------------------------------------------------ compactação

const compactarHaiku = async ($: $, msgs: readonly SessionMessage[], instrucoes: string) => {
  let t = transcricao(msgs)
  if (t.length > MAX_CARACTERES) t = transcricao(msgs, 300, 4000)
  if (t.length > MAX_CARACTERES) return { falha: T.longoDemais } as const
  const r = await $.model.complete({
    model: HAIKU,
    system: COMPACTAR_SISTEMA,
    prompt: `${t}\n\n---\nWrite the summary now.\nThe user asked the summary to keep or stress: ${instrucoes}`,
    maxTokens: 16000,
    effort: 'medium',
    timeoutMs: 240_000,
  })
  if (!r.isAnswered) return { falha: r.reason } as const
  if (r.text.trim().length < 200) return { falha: T.resumoVazio } as const
  return { texto: r.text.trim(), uso: r.usage } as const
}

/** Compacta já: pelo evento (cai no hook abaixo), e pelo /compact do app se o motor achar que há turno rodando. */
const compactar = async ($: $, nota: string, motivo: string) => {
  if ((await read($, etapa)) !== null) return
  await update($, etapa, () => 'compactando')
  try {
    try {
      const r = await $.session.compact({ instructions: nota || undefined })
      if ('skip' in r && r.skip) return
    } catch {
      await $.command.run({ command: 'compact', args: nota })
    }
    await cacheEsfriado($)
    await update($, conselho, () => null)
    avisar($, motivo)
  } catch (erro) {
    avisar($, T.compactacaoFalhou(String(erro).slice(0, 120)))
  } finally {
    await update($, etapa, () => null)
  }
}

// ------------------------------------------------------------ handoff

const iniciarHandoff = async ($: $, completo: boolean, depois: Config['depoisHandoff']) => {
  if ((await read($, etapa)) !== null) return T.jaEmAndamento
  await update($, etapa, () => 'escrevendo')
  handoff = { fila: true, completo, depois, dirigindo: false }
  return completo ? T.escrevendoCompleto : T.escrevendoHandoff
}

/** Escreve o handoff: o rápido por um fork (ou pelo Haiku com o cache frio), o completo como um turno. Roda no relógio. */
const escreverHandoff = async ($: $) => {
  if (!handoff.fila) return
  handoff.fila = false
  try {
    if (handoff.completo) {
      if (config.skillHandoff) await $.command.run({ command: config.skillHandoff, args: '' })
      else await $.prompt.submit({ text: HANDOFF_COMPLETO_PROMPT })
      return
    }
    // Cache frio: um fork releria o chat todo a preço cheio. O Haiku escreve da transcrição por uma fração disso.
    const frio = cacheExpira > 0 && (await $.clock.now()) >= cacheExpira
    if (frio) {
      const msgs = await $.session.messages().catch(() => [] as SessionMessage[])
      let t = transcricao(msgs)
      if (t.length > MAX_CARACTERES) t = transcricao(msgs, 300, 4000)
      if (msgs.length && t.length <= MAX_CARACTERES) {
        const r = await $.model.complete({
          model: HAIKU,
          system: 'You read a conversation between a user and Claude Code, an AI coding agent, and write the handoff the user asks for.',
          prompt: `${t}\n\n---\n${HANDOFF_PROMPT}`,
          maxTokens: 4000,
          effort: 'medium',
          timeoutMs: 120_000,
        })
        if (r.isAnswered && r.text.trim().length > 100) {
          handoff.texto = comManifesto(r.text.trim(), manifesto(msgs))
          return
        }
      }
    }
    // Cache quente: um fork do próprio modelo, que lê o começo do chat do cache, sem ferramentas e sem turno.
    const f = (await $.model.fork({ prompt: HANDOFF_PROMPT }).catch((e: unknown) => e)) as ModelForkResult
    if (f && typeof f === 'object' && 'isAnswered' in f && f.isAnswered && f.text.trim()) {
      handoff.texto = f.text
      return
    }
    await $.prompt.submit({ text: HANDOFF_PROMPT })
    handoff.completo = true // a resposta do turno vira o handoff, como no completo
  } catch (erro) {
    await update($, etapa, () => null)
    avisar($, T.handoffFalhou(String(erro).slice(0, 120)))
  }
}

/** Limpa o chat e manda o handoff escrito como primeira mensagem (ou copia). Roda no relógio, onde comandos podem rodar. */
const terminarHandoff = async ($: $) => {
  await escreverHandoff($)
  if (handoff.texto === undefined || handoff.dirigindo) return
  handoff.dirigindo = true
  const texto = handoff.texto
  handoff.texto = undefined
  const skill = handoff.completo && config.skillHandoff ? config.skillHandoff : undefined
  try {
    if (handoff.depois === 'copy') {
      const msg = mensagemHandoff(texto, 'continue', skill)
      const c = await $.ui.copy({ text: msg }).catch(() => ({ isCopied: false as const }))
      if (c.isCopied) avisar($, T.handoffCopiado)
      else {
        await $.prompt.fill({ text: msg, mode: 'replace' })
        avisar($, T.handoffNaCaixa)
      }
    } else {
      await update($, etapa, () => 'limpando')
      await $.command.run({ command: 'clear', args: '' })
      await cacheEsfriado($)
      await update($, conselho, () => null)
      await update($, fechados, () => FECHADOS_VAZIO)
      await $.prompt.submit({ text: mensagemHandoff(texto, handoff.depois, skill) })
    }
    await somar($, g => ({ ...g, handoffs: g.handoffs + 1 }))
  } catch (erro) {
    avisar($, T.handoffFalhou(String(erro).slice(0, 120)))
  } finally {
    handoff.dirigindo = false
    await update($, etapa, () => null)
  }
}

/** O Haiku diz se um chat novo renderia mais. A partir de 30% do orçamento, a cada 2 mensagens; nunca segura a mensagem. */
const checarConselho = async ($: $, proxima: string) => {
  const c = await read($, ctx)
  const pct = c.tokens !== null ? (c.tokens / c.janela) * 100 : 0
  if (pct < CONSELHO_DESDE) {
    conselhoContador = 0
    if ((await read($, conselho)) !== null) await update($, conselho, () => null)
    return
  }
  if (++conselhoContador < CONSELHO_CADA) return
  conselhoContador = 0
  const msgs = await $.session.messages().catch(() => [] as SessionMessage[])
  const frio = (await read($, cacheMin)) === 0
  const r = await perguntarHaiku($, conselhoSistema(), evidenciaHandoff(msgs, proxima, pct, frio), 60, 8000)
  if (!r.isAnswered) return
  const motivo = lerConselho(r.text)
  if (motivo !== (await read($, conselho))) await update($, conselho, () => motivo)
}

// ------------------------------------------------------------ relógio

const tick = async ($: $) => {
  await mostrarCache($)
  await terminarHandoff($)
  if (config.ociosoMin <= 0 || ociosoDesde === null || trabalhando || (await read($, etapa)) !== null) return
  const resta = ociosoDesde + config.ociosoMin * 60_000 - (await $.clock.now())
  const min = Math.ceil(resta / 60_000)
  const mostrar = resta > 0 && min <= AVISO_OCIOSO_MIN ? min : null
  if (mostrar !== (await read($, compactaEm))) await update($, compactaEm, () => mostrar)
  if (resta > 0) return
  ociosoDesde = null
  await update($, compactaEm, () => null)
  const { tokens } = await read($, ctx)
  if ((tokens ?? 0) < config.minimoCompactar) return
  await compactar($, '', `${config.ociosoMin} min parado, conversa compactada (${fmtK(tokens ?? 0)} tokens)`)
}

const iniciarRelogio = ($: $) => {
  if (relogio) return
  relogio = true
  $.clock.every(TICK_MS, () => void tick($).catch(() => undefined))
}

const pararOcioso = async ($: $) => {
  ociosoDesde = null
  if ((await read($, compactaEm)) !== null) await update($, compactaEm, () => null)
}

/** Roda os casos rotulados pelo mesmo caminho de um prompt real: pedido explícito, seguimento, juiz. Quatro de cada vez. */
async function rodarBench($: $, casos: CasoBench[], modo: ModoJuiz): Promise<RespostaBench[]> {
  const respostas: RespostaBench[] = []
  const fila = [...casos]
  const um = async (caso: CasoBench) => {
    const modelo = `claude-${caso.current.model}-5-5`
    const atual: Escolha = { esforco: caso.current.effort, motivo: '', por: 'haiku' }
    const inicio = await $.clock.now()
    const msgs = caso.context
      ? caso.context.split(/\n(?=(?:user|assistant): )/).map(l => ({ role: l.startsWith('assistant:') ? 'assistant' : 'user', text: l.replace(/^(user|assistant): /, '') }))
      : []
    const contexto = msgs.length ? contextoDe(msgs) : ''
    const pedido = esforcoPedido(caso.message)
    let r: Escolha | undefined
    if (pedido) r = { esforco: pedido, motivo: '', por: 'pedido' }
    else if (mantemEsforco(caso.message, contexto)) r = { ...atual, por: 'seguimento' }
    else {
      const j = await julgarCom($, modo, caso.message, modelo, atual.esforco, contexto, undefined, 10_000)
      const v = j.veredito
      r = v && { esforco: limitado(inclinado(v.esforco, v.certeza, config.vies), config.piso, config.teto), motivo: v.motivo, por: j.por }
    }
    respostas.push({ id: caso.id, esforco: r?.esforco, por: r?.por ?? 'nenhum', ms: (await $.clock.now()) - inicio })
  }
  while (fila.length) await Promise.all(fila.splice(0, 4).map(um))
  return respostas
}

export const register: Register = (on, opcoes) => {
  config = lerConfig(opcoes)
  usarLingua(config.lingua)

  // ------------------------------------------------------------ eventos

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    $.ui.status(undefined) // o contexto-pct antigo usava a status line
    await $.command.register({ name: P, description: 'cadence: status, auto, judge, handoff, compact, saver, stats, savings, bench, help' }).catch(() => undefined)
    await update($, auto, () => config.auto)
    ascii = (await $.env.get('TERM').catch(() => undefined)) === 'dumb'
    const memo = await read($, cacheMemo)
    if (memo && memo.expira > 0 && cacheExpira === 0) {
      cacheExpira = memo.expira
      cacheTtl = memo.ttl
    }
    const { context, rateLimits } = await $.session.usage()
    await guardarUso($, context, rateLimits)
    iniciarRelogio($)
    return r
  })

  // Um chat retomado: o app diz há quanto tempo veio a última resposta, e o cronômetro do cache parte daí.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const s = e as { source?: string; seconds_since_last_response?: number; prompt_cache_likely_expired?: boolean }
    if ((s.source === 'resume' || s.source === 'fork') && typeof s.seconds_since_last_response === 'number' && cacheExpira === 0) {
      const agora = await $.clock.now()
      ultimaRespostaEm = agora - s.seconds_since_last_response * 1000
      const resta = ultimaRespostaEm + TTL[cacheTtl]
      cacheExpira = s.prompt_cache_likely_expired || resta <= agora ? agora - 1 : resta
      await lembrarCache($)
      await mostrarCache($)
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    await guardarUso($, e.context, e.rateLimits)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await pararOcioso($)
    const porPessoa = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    if (!porPessoa || e.isMeta) return next(e)
    const texto = e.text.trim()
    const barra = texto.startsWith('/')
    if (config.conselho && !barra && !ehSeguimento(texto)) void checarConselho($, texto).catch(() => undefined)
    if (!(await read($, auto))) return next(e)
    const skill = barra ? await skillDigitada($, texto) : undefined
    if (barra && !skill) return next(e)
    const modelo = await $.session.model()
    if (semEsforco(modelo)) return next(e)
    const seguro = cacheSeguro(modelo)
    if (seguro === (await read($, pausado))) await update($, pausado, () => !seguro)
    if (!seguro) return next(e)

    const atual = await read($, escolha)
    const meioTurno = e.turnId !== undefined && atual !== null
    const dito = skill ? `${texto}\n\n[This slash command runs a skill: ${skill.descricao || skill.nome}. Judge the work the skill will do.]` : texto
    const lido = comAnexos(meioTurno && atual ? noMeioDoTurno(dito, atual.esforco) : dito, e.attachments)
    const contexto = contextoDe(await $.session.messages().catch(() => [] as SessionMessage[]))

    await update($, julgando, () => true)
    try {
      const nova = await decidir($, texto, lido, modelo, atual, contexto, !!e.attachments?.length || !!skill)
      if (nova?.por === 'pedido') await somar($, g => ({ ...g, juiz: { ...g.juiz, pedidos: g.juiz.pedidos + 1 } }))
      if (nova?.por === 'seguimento') await somar($, g => ({ ...g, juiz: { ...g.juiz, seguimentos: g.juiz.seguimentos + 1 } }))
      if (nova) await aplicar($, nova, meioTurno)
    } catch {
      // Um juiz que falhou nunca segura a mensagem: ela segue com o esforço em vigor.
    } finally {
      await update($, julgando, () => false)
    }
    return next(e)
  })

  // Roteador: cada subagente novo ganha o esforço da tarefa dele. O juiz começa antes do spawn e é esperado depois,
  // para o subagente subir enquanto o juiz pensa. Um retomado mantém o esforço que já tinha.
  on('agent.spawn', async ($, e, next) => {
    if (e.resume || !(await read($, auto))) return next(e)
    const rota = rotear($, e).catch(() => undefined)
    const r = await next(e)
    const final = await rota
    if (r.agentId && !('deny' in r)) {
      rotas.set(r.agentId, final)
      if (rotas.size > 500) rotas.delete(rotas.keys().next().value!)
    }
    return r
  })

  // Cada requisição vai com o esforço escolhido; as respostas da conversa principal reacendem o cronômetro do cache.
  on('turn.step', async function* ($, e, next) {
    const principal = e.agentId === undefined
    if (principal) {
      trabalhando = true
      ociosoDesde = null
    }
    // A primeira leitura é o esforço do app; uma mudança depois dela foi o usuário, que sempre ganha.
    if (principal && typeof e.effort === 'string') {
      const mudou = motorEsforco !== undefined && e.effort !== motorEsforco
      motorEsforco = e.effort
      if (mudou && (await read($, auto))) {
        await update($, auto, () => false)
        await update($, escolha, () => ({ esforco: e.effort as Esforco, motivo: T.motivoApp, por: 'manual' }))
        avisar($, T.voceEscolheu(NOME_ESFORCO[e.effort as Esforco] ?? e.effort))
      }
    }
    const esc = await read($, escolha)
    const ligado = await read($, auto)
    let pedido = e
    const rota = principal ? undefined : rotas.get(e.agentId!)
    if (ligado && rota && typeof e.effort === 'string' && !semEsforco(e.model)) {
      // O subagente roteado tem um esforço só, do primeiro pedido ao último: o cache dele não se perde.
      pedido = { ...e, effort: rota.esforco }
    } else if (ligado && esc && esc.por !== 'manual' && typeof e.effort === 'string' && cacheSeguro(e.model) && !semEsforco(e.model)) {
      pedido = { ...e, effort: principal ? esc.esforco : pisoAjudante(esc.esforco) }
    }
    const resposta = yield* next(pedido)
    if (principal && resposta?.usage) {
      await cacheTocado($, resposta.usage).catch(() => undefined)
      if (pedido !== e && esc) {
        const usd = dolares(resposta.usage, e.model)
        await somar($, g => {
          const b = g.porEsforco[esc.esforco] ?? { prompts: 0, usd: 0 }
          return { ...g, requisicoes: g.requisicoes + 1, usd: g.usd + usd, porEsforco: { ...g.porEsforco, [esc.esforco]: { ...b, usd: b.usd + usd } } }
        })
      }
    }
    return resposta
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    trabalhando = false
    ociosoDesde = await $.clock.now()
    // Uma escolha menor feita no meio do turno entra agora.
    if (segurada) {
      const s = segurada
      segurada = null
      if (await read($, auto)) await aplicar($, s, false)
    }
    // O turno que escreveu o handoff acabou: o texto dele é o handoff; o relógio limpa e reenvia.
    if ((await read($, etapa)) === 'escrevendo' && handoff.completo && !handoff.fila && handoff.texto === undefined) {
      if (e.reason === 'answer' && e.answer.trim()) handoff.texto = e.answer
      else {
        await update($, etapa, () => null)
        avisar($, T.handoffNaoEscrito)
      }
    }
    return r
  })

  // Toda compactação (o /compact, a automática, a do cadence) ganha as instruções de preservação; com o Haiku,
  // o resumo sai dele e leva embaixo o manifesto tirado da transcrição. Se o Haiku falhar, o Claude Code compacta.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const instrucoes = [PRESERVAR, e.instructions?.trim()].filter(Boolean).join('\n')
    // O que segue para o motor: as mesmas mensagens (só quando vieram em lista) e as instruções somadas.
    // O motor sempre manda a transcrição; sem ela (um teste), segue a lida da sessão.
    const transcrita = Array.isArray(e.messages) ? e.messages : await $.session.messages().catch(() => [] as SessionMessage[])
    const adiante = { ...e, messages: transcrita, instructions: instrucoes }
    const antes = (await read($, ctx)).tokens ?? 0
    if (config.compactarCom === 'session') {
      const r = await next(adiante)
      if (e.trigger !== 'precompute' && r.messages) {
        const feito = r
        await somar($, g => ({
          ...g,
          compactacoes: { ...g.compactacoes, sessao: g.compactacoes.sessao + 1, antes: g.compactacoes.antes + (feito.tokensBefore ?? antes), depois: g.compactacoes.depois + (feito.tokensAfter ?? 0) },
        }))
        await cacheEsfriado($)
        if (feito.tokensAfter !== undefined) await update($, ctx, c => ({ ...c, tokens: feito.tokensAfter ?? null }))
      }
      return r
    }
    // Resumos adiantados seriam escritos pelo modelo do chat e depois descartados.
    if (e.trigger === 'precompute') return { skip: T.skipPrecompute }
    const msgs = transcrita
    const r = await compactarHaiku($, msgs, instrucoes).catch((erro: unknown) => ({ falha: String(erro).slice(0, 80) }) as const)
    if ('falha' in r) {
      await somar($, g => ({ ...g, compactacoes: { ...g.compactacoes, falhas: g.compactacoes.falhas + 1 } }))
      avisar($, T.haikuNaoCompactou(r.falha ?? "?"))
      return next(adiante)
    }
    const texto = mensagemCompactada(comManifesto(r.texto, manifesto(msgs)), true)
    const depois = Math.ceil(texto.length / 3.5)
    const modelo = await $.session.model().catch(() => 'opus')
    const p = PRECO[familia(modelo)]
    // O que o modelo do chat gastaria: reler o contexto do cache quente e escrever o mesmo resumo.
    const sessaoEstimado = (antes * p.read + (r.uso.output_tokens ?? 0) * p.out) / 1_000_000
    await somar($, g => ({
      ...g,
      compactacoes: {
        ...g.compactacoes,
        haiku: g.compactacoes.haiku + 1,
        antes: g.compactacoes.antes + antes,
        depois: g.compactacoes.depois + depois,
        usd: g.compactacoes.usd + dolares(r.uso, HAIKU),
        usdSessaoEstimado: g.compactacoes.usdSessaoEstimado + sessaoEstimado,
      },
    }))
    await cacheEsfriado($)
    await update($, ctx, c => ({ ...c, tokens: depois }))
    return { messages: [{ role: 'user' as const, text: texto, toolUses: [] }], tokensBefore: antes, tokensAfter: depois }
  })

  on('command.run', { command: P }, async ($, e) => {
    const [sub = '', ...resto] = e.args.trim().split(/\s+/)
    const arg = sub.toLowerCase()
    const extra = resto.join(' ')

    if (arg === 'auto') {
      const novo = !(await read($, auto))
      await update($, auto, () => novo)
      if (novo) await update($, escolha, esc => (esc?.por === 'manual' ? null : esc))
      return { text: novo ? T.autoLigado : T.autoDesligado }
    }
    if (arg === 'saver') {
      const ligada = (await read($, economiaAte)) !== null
      const quente = [...(await read($, limites))].sort((a, b) => b.pct - a.pct)[0]
      const ate = quente?.resetsAt ? new Date(quente.resetsAt).getTime() : (await $.clock.now()) + 5 * 3600_000
      await update($, economiaAte, () => (ligada ? null : ate))
      return { text: ligada ? T.economiaDesligada : T.economiaLigada(rotuloReset(new Date(ate).toISOString(), await $.clock.now())) }
    }
    if (arg === 'handoff') {
      const palavras = extra.toLowerCase().split(/\s+/)
      const completo = palavras.includes('full')
      const depois = palavras.includes('copy') ? 'copy' : palavras.includes('wait') ? 'wait' : palavras.includes('continue') ? 'continue' : config.depoisHandoff
      return { text: await iniciarHandoff($, completo, depois) }
    }
    if (arg === 'compact') {
      // Fora do turno do comando: o relógio roda a compactação quando a sessão estiver parada.
      $.clock.after(0, () => void compactar($, extra, T.compactado))
      return { text: T.compactandoCmd }
    }
    if (arg === 'stats') {
      const { cost } = await $.session.usage()
      return { text: textoGasto(comoGasto(await read($, gasto)), cost?.usd) }
    }
    if (arg === 'savings') return { text: textoEconomia(comoGasto(await read($, gasto))) }
    if (arg === 'judge') return { text: await testarJuizes($) }
    if (arg === 'bench') {
      const dados = JSON.parse(await $.fs.read(`${$.plugin.root}/bench/casos-juiz.json`)) as { cases: CasoBench[] }
      const palavras = extra.toLowerCase().split(/\s+/)
      const casos = palavras.includes('pt') ? dados.cases.filter(c => c.lang === 'pt') : dados.cases
      const modo = MODOS_JUIZ.find(m => palavras.includes(m)) ?? config.juiz
      const respostas = await rodarBench($, casos, modo)
      const relatorio = relatorioBench(casos, respostas)
      const quando = new Date(await $.clock.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const arquivo = `${$.plugin.root}/bench/resultados/bench-${quando}.md`
      await $.fs.write(arquivo, `${T.bench.titulo(modo, quando)}\n\n${relatorio}\n`).catch(() => undefined)
      return { text: `${relatorio}\n\n${T.salvoEm(arquivo)}` }
    }
    if (arg === 'help') return { text: T.ajuda.join('\n') }
    // Sem argumento: o estado.
    const esc = await read($, escolha)
    const c = await read($, ctx)
    const min = await read($, cacheMin)
    return {
      text: [
        T.status.esforco(
          await read($, auto),
          esc ? `, ${NOME_ESFORCO[esc.esforco]} (${T.porQuem[esc.por] ?? esc.por}: ${esc.motivo})` : '',
          await read($, pausado),
        ),
        T.status.contexto(c.tokens === null ? '—' : fmtK(c.tokens), fmtK(c.janela)),
        T.status.cache(min === null ? T.status.semResposta : rotuloCache(min), cacheTtl),
        T.status.juiz(descreverJuiz(Boolean(await acharChave($)))),
        T.status.compactacao(config.compactarCom === 'haiku', config.ociosoMin),
        T.status.ajuda,
      ].join('\n'),
    }
  })

  // ------------------------------------------------------------ a barra
  //
  // Duas linhas. A 1 é o estado (contexto, esforço, cache) com as pílulas dos limites à direita; a 2 é um aviso
  // por vez, o mais urgente, com o botão que resolve primeiro. No desktop o contexto e o cache viram anéis e os
  // limites viram medidores; no terminal, quadradinhos e pílulas. Ver hooks/visual.ts para as regras de contraste.

  // Embaixo da linha do Agent, o esforço que o roteador deu ao subagente.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Agent') return next(e)
    const r = (await read($, rotasUi))[e.props.tool_use_id]
    if (!r) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const linha = await next(e)
    return (
      <Box flexDirection="column">
        {linha}
        <Text dimColor>{`${ascii ? '' : `${GLIFO[r.esforco]} `}${T.rotaSubagente(NOME_ESFORCO[r.esforco], r.motivo)}`}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const Svg = 'Svg' in el ? (el.Svg as Elements['desktop']['Svg']) : undefined
    const grafico = e.surface !== 'terminal' && Svg !== undefined
    const c = await read($, ctx)
    const janela = config.janela
    const tokens = c.tokens
    const esc = await read($, escolha)
    const ligado = await read($, auto)
    const min = await read($, cacheMin)
    const ociosoMin = await read($, compactaEm)
    const ls = await read($, limites)
    const econ = (await read($, economiaAte)) !== null
    const fase = await read($, etapa)
    const f = await read($, fechados)
    const aviso = await read($, conselho)
    const decidindo = await read($, julgando)
    const parado = await read($, pausado)
    const agora = await $.clock.now()
    const cols = e.props.bodyColumns
    const cabem = cabe(cols)

    const pct = tokens === null ? null : (tokens / janela) * 100
    const pesado = tokens !== null && pct! >= config.pantanoPct
    const nivelCtx: Nivel = pct === null ? 'neutro' : nivelPct(pct, Math.min(70, config.pantanoPct - 10), config.pantanoPct)
    const sep = <Text dimColor>{ascii ? ' - ' : ' · '}</Text>

    // ---- esforço: glifo pela forma, palavra pelo nome, cor pelo nível
    const esforco = decidindo ? (
      <Text color={TEMA.destaque}>{ascii ? '* ' : '◐ '}{T.decidindo}</Text>
    ) : parado ? (
      <Text dimColor>{ascii ? '' : '◌ '}{T.pausado}</Text>
    ) : !ligado ? (
      <Text dimColor>{esc ? `${ascii ? '' : `${GLIFO[esc.esforco]} `}${T.manual(NOME_ESFORCO[esc.esforco])}` : T.esforcoManual}</Text>
    ) : esc ? (
      <Text color={TEMA[NIVEL_ESFORCO[esc.esforco]]} weight={esc.esforco === 'max' ? 'semibold' : undefined}>
        {ascii ? '' : `${GLIFO[esc.esforco]} `}{grafico ? T.esforcoTitulo(NOME_ESFORCO[esc.esforco]) : NOME_ESFORCO[esc.esforco]}{econ ? ` · ${T.economia}` : ''}
      </Text>
    ) : (
      <Text dimColor>{ascii ? '' : '○ '}auto{econ ? ` · ${T.economia}` : ''}</Text>
    )

    // ---- cache: minutos que restam, ou "frio"
    const nCache = min === null ? null : nivelCache(min)
    const cacheTxt = min === null ? null : min === 0 ? T.frio : grafico ? (min === 1 ? '<1 min' : `${min - 1} min`) : rotuloCache(min)
    const cache =
      min === null || !cabem.cache ? null : (
        <Text color={TEMA[nCache!]} dimColor={nCache === 'neutro'} weight={nCache === 'critico' ? 'semibold' : undefined}>
          {grafico ? '' : 'cache '}{cacheTxt}
        </Text>
      )

    // ---- limites: 5h sempre que houver, 7d só a partir de 70%
    const vistos = ls.filter(l => l.kind === 'five_hour' || l.pct >= 70)
    const nivelLimite = (u: number) => nivelPct(u, 70, 90) as Exclude<Nivel, 'neutro'>
    const nomeLimite = (k: string) => (k === 'five_hour' ? '5h' : '7d')
    const compactaTxt = ociosoMin === null ? null : cabem.pilulaLonga ? T.compactaEm(ociosoMin) : T.compactaCurto(ociosoMin)

    let linha1: JSX.Element
    if (grafico && Svg) {
      const meio = (
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Svg
            source={svgAnel(pct ?? 0, nivelCtx)}
            width={24}
            height={24}
            alt={pct === null ? T.ctxSemMedida : T.ctxAlt(Math.round(pct), porExtenso(tokens!), porExtenso(janela))}
          />
          <Text weight="semibold" color={nivelCtx === 'ok' ? undefined : TEMA[nivelCtx]}>{pct === null ? '—' : `${Math.round(pct)}%`}</Text>
          <Text dimColor size="footnote">{tokens === null ? T.de(fmtK(janela)) : `${fmtK(tokens)} / ${fmtK(janela)}`}</Text>
          <Box borderStyle="round" borderColor={esc && ligado && !decidindo ? TEMA[NIVEL_ESFORCO[esc.esforco]] ?? 'subtle' : 'subtle'} paddingX={1}>
            {esforco}
          </Box>
          {min !== null ? (
            <Box flexDirection="row" alignItems="center" gap="xs">
              <Svg
                source={svgCache(min === 0 ? 0 : min - 1, TTL[cacheTtl] / 60_000, nCache!)}
                width={20}
                height={20}
                alt={min === 0 ? T.cacheFrio : T.cacheRestam(cacheTxt ?? '')}
              />
              <Text dimColor={nCache === 'neutro'} color={TEMA[nCache!]} size="footnote">
                {min === 0 ? T.cacheFrio : `cache ${cacheTxt}`}
              </Text>
            </Box>
          ) : null}
        </Box>
      )
      const medidores = (
        <Box flexDirection="row" alignItems="center" gap="md" flexShrink={0}>
          {compactaTxt ? (
            <Text size="footnote" color={TEMA.info}>{compactaTxt}</Text>
          ) : null}
          {vistos.map(l => (
            <Box key={l.kind} flexDirection="row" alignItems="center" gap="xs">
              <Text dimColor size="footnote">{nomeLimite(l.kind)}</Text>
              <Svg
                source={svgMedidor(l.pct, nivelLimite(l.pct))}
                width={56}
                height={6}
                alt={T.limiteAlt(l.kind === 'five_hour', Math.round(l.pct), l.resetsAt ? rotuloReset(l.resetsAt, agora) : '')}
              />
              <Text size="footnote" weight="medium" color={l.pct >= 70 ? TEMA[nivelLimite(l.pct)] : undefined}>{Math.round(l.pct)}%</Text>
              {l.resetsAt && l.pct >= 70 ? <Text dimColor size="caption">{T.as(rotuloReset(l.resetsAt, agora))}</Text> : null}
            </Box>
          ))}
        </Box>
      )
      linha1 = (
        <Box flexDirection="row" width="100%" justifyContent="space-between" alignItems="center" paddingX={1} gap="md">
          {meio}
          {medidores}
        </Box>
      )
    } else {
      // Thin bars, no backgrounds: ctx, 5h with its countdown and 7d, three spaces apart.
      const n = celulas(cols)
      const fina = (pctBarra: number, largura: number, nivel: Nivel) => {
        if (ascii) return <Text color={TEMA[nivel]}>{barraAscii(Math.round((pctBarra * largura) / 100), largura)}</Text>
        const { cheias, vazias } = barraFina(pctBarra, largura)
        return (
          <Text>
            <Text color={TRACO[nivel]}>{TRACO_BARRA.repeat(cheias)}</Text>
            <Text color={TRILHO}>{TRACO_BARRA.repeat(vazias)}</Text>
          </Text>
        )
      }
      const cinco = ls.find(l => l.kind === 'five_hour')
      const sete = ls.find(l => l.kind === 'seven_day')
      const falta = cinco ? contagem(cinco.resetsAt, agora) : ''
      // One row, each segment in its own spot: ctx anchored left, 5h and 7d spread across the middle, effort at the right edge.
      // The right padding keeps clear of the app's own collapse control.
      linha1 = (
        <Box flexDirection="row" width="100%" gap={4} paddingRight={5}>
          <Box flexDirection="row" flexShrink={0}>
            <Text dimColor>ctx </Text>
            {fina(pct ?? 0, n, nivelCtx)}
            <Text color={nivelCtx === 'ok' ? undefined : TEMA[nivelCtx]} weight={pesado ? 'semibold' : undefined}>
              {pct === null ? ' —' : ` ${Math.round(pct)}%`}
            </Text>
            <Text dimColor>{tokens === null ? ` ${fmtK(janela)}` : ` ${fmtK(tokens)}${cabem.orcamento ? `/${fmtK(janela)}` : ''}`}</Text>
          </Box>
          {cinco ? (
            <Box flexDirection="row" flexShrink={0}>
              <Text dimColor>5h </Text>
              {fina(cinco.pct, Math.max(4, n - 2), nivelLimite(cinco.pct))}
              <Text color={TEMA[nivelLimite(cinco.pct)]}>{` ${Math.round(cinco.pct)}%`}</Text>
              {falta && cols >= 80 ? <Text dimColor>{` ${ascii ? '' : '↻ '}${falta}`}</Text> : null}
            </Box>
          ) : null}
          {sete && cabem.orcamento ? (
            <Box flexDirection="row" flexShrink={0}>
              <Text dimColor>7d </Text>
              <Text color={TEMA[nivelLimite(sete.pct)]}>{`${Math.round(sete.pct)}%`}</Text>
            </Box>
          ) : null}
          <Box flexDirection="row" flexShrink={1}>
            {compactaTxt ? <Text color={TEMA.info}>{compactaTxt}{'   '}</Text> : null}
            {esforco}
          </Box>
        </Box>
      )
    }

    // ---- linha 2: um aviso por vez, o mais urgente. Some enquanto o agente trabalha, menos o que está em curso.
    type Acao = { id: string; rotulo: string; acao: (p: UiPressArgument) => unknown }
    const btCompactar: Acao = { id: 'compactar', rotulo: T.btCompactar, acao: () => compactar($, '', T.compactado) }
    const btNovo: Acao = { id: 'handoff', rotulo: T.btNovo, acao: () => iniciarHandoff($, false, config.depoisHandoff) }
    const alerta = (nivel: Nivel, chave: string, resto: string, principal: Acao, outras: Acao[], fechar: () => unknown) => {
      const botoes = e.props.isWorking ? null : (
        <Box flexDirection="row" flexShrink={0} gap={grafico ? 'sm' : 1}>
          <Button key={principal.id} label={principal.rotulo} variant="primary" onPress={p => void principal.acao(p)} />
          {outras.map(b => (
            <Button key={b.id} label={b.rotulo} variant="secondary" onPress={p => void b.acao(p)} />
          ))}
          <Button key="fechar" label={grafico ? T.btFechar : ascii ? 'x' : '✕'} role="dismiss" dimColor onPress={() => void fechar()} />
        </Box>
      )
      return grafico ? (
        <Box flexDirection="row" width="100%" alignItems="center" gap="sm" borderStyle="round" borderColor={TEMA[nivel] ?? 'subtle'} paddingX={1}>
          <Text color={TEMA[nivel]}>●</Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              <Text weight="semibold">{chave}</Text>
              {resto}
            </Text>
          </Box>
          {botoes}
        </Box>
      ) : (
        <Box flexDirection="row" width="100%" gap={1}>
          <Box flexDirection="row" flexShrink={1}>
            <Text color={TEMA[nivel]}>{ascii ? '| ' : '│ '}</Text>
            <Text wrap="truncate-end">
              <Text weight="semibold">{chave}</Text>
              {resto}
            </Text>
          </Box>
          {botoes}
        </Box>
      )
    }
    const andamento = (texto: string) =>
      grafico ? (
        <Box flexDirection="row" width="100%" gap="sm" paddingX={1}>
          <Text color={TEMA.destaque}>◐</Text>
          <Text color={TEMA.destaque}>{texto}</Text>
        </Box>
      ) : (
        <Text color={TEMA.destaque}>{ascii ? '| ' : '│ ◐ '}{texto}</Text>
      )

    let linha2: JSX.Element | null = null
    const quente = [...ls].sort((a, b) => b.pct - a.pct)[0]
    const chaveQuente = quente ? `${quente.kind} ${quente.resetsAt ?? ''}` : ''
    if (fase !== null) {
      linha2 = andamento(fase === 'escrevendo' ? T.escrevendo : fase === 'limpando' ? T.limpando : T.compactando)
    } else if (aviso && f.conselho !== aviso) {
      linha2 = alerta('destaque', T.conselho, aviso, btNovo, [btCompactar], () => update($, fechados, x => ({ ...x, conselho: aviso })))
    } else if (min === 0 && tokens !== null && tokens >= FRIO_MIN && !f.frio) {
      linha2 = alerta('info', T.frioChave, T.frioResto(fmtK(tokens)), btCompactar, [btNovo], () =>
        update($, fechados, x => ({ ...x, frio: true })),
      )
    } else if (pesado && !(f.pantanoAte !== null && tokens! < f.pantanoAte + PANTANO_REVOLTA)) {
      linha2 = alerta(nivelCtx === 'critico' ? 'critico' : 'aviso', T.pesadoChave, T.pesadoResto(fmtK(tokens!)), btCompactar, [btNovo], () =>
        update($, fechados, x => ({ ...x, pantanoAte: tokens })),
      )
    } else if (quente && quente.pct >= QUENTE_PCT && f.quente !== chaveQuente) {
      linha2 = alerta(
        nivelLimite(quente.pct),
        T.limiteChave(quente.kind === 'five_hour', Math.round(quente.pct)),
        T.limiteResto(quente.resetsAt ? rotuloReset(quente.resetsAt, agora) : '', econ),
        {
          id: 'economia',
          rotulo: T.btEconomia(econ),
          acao: async () => update($, economiaAte, () => (econ ? null : quente.resetsAt ? new Date(quente.resetsAt).getTime() : agora + 5 * 3600_000)),
        },
        [],
        () => update($, fechados, x => ({ ...x, quente: chaveQuente })),
      )
    }

    return (
      <Box flexDirection="column" width="100%" gap={grafico ? 'xs' : 0}>
        {linha1}
        {linha2}
      </Box>
    )
  })
}
