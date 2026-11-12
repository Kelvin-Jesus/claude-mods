// Every word the person reads: English by default, Brazilian Portuguese with `language: pt-BR`.
// Commands, option keys and option values are English in both; only what is shown changes.

import type { Esforco, NomeJuiz } from '../types'

export type Lingua = 'en' | 'pt-BR'

const EN = {
  locale: 'en-US',
  /** The language the models write the "why" and the handoff advice in. */
  idiomaModelo: 'English',
  esforco: { low: 'low', medium: 'medium', high: 'high', xhigh: 'very high', max: 'max' } as Record<Esforco, string>,
  esforcoTitulo: (e: string) => `${e[0]!.toUpperCase()}${e.slice(1)} effort`,
  juiz: { haiku: 'Haiku', jev: 'Jev', local: 'local judge' } as Record<NomeJuiz, string>,
  dias: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  mil: (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} million` : `${Math.round(n / 1000)} thousand`),

  // band
  decidindo: 'deciding…',
  pausado: 'paused on this model',
  manual: (e: string) => `${e} (manual)`,
  esforcoManual: 'manual effort',
  economia: 'saver',
  frio: 'cold',
  cacheFrio: 'cache cold',
  cacheRestam: (t: string) => `Cache, ${t} left`,
  compactaEm: (m: number) => `compacts in ${m} min`,
  compactaCurto: (m: number) => `compacts ${m}m`,
  ctxAlt: (pct: number, usados: string, total: string) => `Context ${pct}%, ${usados} of ${total}`,
  ctxSemMedida: 'Context not measured yet',
  de: (total: string) => `of ${total}`,
  limiteAlt: (cinco: boolean, pct: number, renova: string) => `${cinco ? '5-hour' : '7-day'} limit at ${pct}%${renova ? `, resets ${renova}` : ''}`,
  as: (h: string) => `at ${h}`,
  btCompactar: 'Compact',
  btNovo: 'New chat',
  btFechar: 'Dismiss',
  btEconomia: (ligada: boolean): string => (ligada ? 'Turn saver off' : 'Turn saver on'),
  escrevendo: 'Writing the summary for the new chat…',
  limpando: 'Opening the new chat…',
  compactando: 'Compacting…',
  conselho: 'A new chat would do better: ',
  frioChave: 'Cache cold: ',
  frioResto: (t: string) => `the next message rereads ${t} at full price`,
  pesadoChave: 'Heavy context: ',
  pesadoResto: (t: string) => `every message rereads ${t}`,
  limiteChave: (cinco: boolean, pct: number) => `${cinco ? '5h' : '7-day'} limit at ${pct}%`,
  limiteResto: (renova: string, econ: boolean) => `${renova ? ` · resets at ${renova}` : ''}${econ ? ' · saver on' : ''}`,

  // toasts
  falhouJuiz: (motivo: string) => `${motivo}; Haiku decides`,
  semChave: 'Jev found no TypeSafe key (option typesafeKey or TYPESAFE_API_KEY)',
  foraDoFormato: (j: string) => `${j} answered in an unexpected format`,
  porQueFalhou: (nome: string, s: number | 'tempo' | 'rede') =>
    s === 'tempo'
      ? `${nome} did not answer in time`
      : s === 'rede'
        ? `${nome} is not reachable`
        : s === 401 || s === 403
          ? `${nome} refused the key (${s})`
          : s === 402
            ? `${nome} is out of credits (${s})`
            : s === 404
              ? `${nome} did not find the model or route (${s})`
              : s === 429
                ? `${nome} is rate limiting (${s})`
                : `${nome} failed (${s})`,
  limiteRenovou: 'the limit reset; saver mode off',
  compactado: 'conversation compacted',
  compactacaoFalhou: (e: string) => `compaction failed: ${e}`,
  haikuNaoCompactou: (m: string) => `Haiku did not compact (${m}); the chat model compacts`,
  longoDemais: 'the chat is too long for Haiku',
  resumoVazio: 'the summary came back empty',
  jaEmAndamento: 'A handoff or compaction is already running.',
  escrevendoCompleto: 'Writing the full handoff (checks git and writes HANDOFF.md)…',
  escrevendoHandoff: 'Writing the handoff…',
  handoffFalhou: (e: string) => `handoff failed: ${e}`,
  handoffCopiado: 'handoff copied. Paste it into a new chat.',
  handoffNaCaixa: 'the clipboard refused; the handoff is in the prompt box',
  handoffNaoEscrito: 'the handoff was not written; nothing was cleared',
  voceEscolheu: (e: string) => `you picked ${e}; auto effort off. /cadence auto turns it back on`,
  skipPrecompute: 'cadence compacts with Haiku when it is time',

  // reasons shown next to the effort
  motivoPedido: 'you asked',
  motivoSeguindo: 'following up',
  motivoEconomia: 'saver mode',
  motivoLimites: 'your limits',
  motivoApp: 'your pick in the app',
  certeza: (p: number) => `${p}% sure`,
  porQuem: { haiku: 'Haiku', jev: 'Jev', local: 'local', pedido: 'asked', seguimento: 'follow-up', manual: 'manual' } as Record<string, string>,

  // /cadence
  autoLigado: 'Auto effort on.',
  autoDesligado: "Auto effort off: the app's effort applies.",
  economiaDesligada: 'Saver mode off.',
  economiaLigada: (ate: string) => `Saver mode on: effort at most medium until ${ate}.`,
  compactandoCmd: 'Compacting…',
  salvoEm: (a: string) => `Saved to ${a}`,
  ajuda: [
    '/cadence                      what applies now',
    '/cadence auto                 turn auto effort on or off',
    '/cadence judge                test each judge in the queue and show its latency',
    '/cadence handoff [full] [continue|wait|copy]',
    '/cadence compact [what the summary should keep]',
    '/cadence saver                effort at most medium until the limit resets',
    '/cadence stats                what this session measured',
    '/cadence bench [pt] [haiku|jev|local]   score a judge on the labeled cases',
  ],
  status: {
    esforco: (auto: boolean, resto: string, pausado: boolean) => `Effort: ${auto ? 'auto' : 'manual'}${resto}${pausado ? ', paused on this model' : ''}`,
    contexto: (t: string, j: string) => `Context: ${t} of ${j}`,
    cache: (c: string, ttl: string) => `Cache: ${c} (lifetime ${ttl})`,
    semResposta: 'no response yet',
    juiz: (d: string) => `Judge: ${d}`,
    compactacao: (haiku: boolean, ocioso: number) =>
      `Compaction: ${haiku ? 'Haiku + safety net' : 'chat model'}; when idle ${ocioso ? `${ocioso} min` : 'off'}`,
    ajuda: '/cadence help lists the commands.',
  },
  testeJuiz: {
    titulo: (d: string) => `Judge ${d}`,
    respondeu: (e: string) => `answered ${e}`,
    duvida: 'answered, unsure (Haiku would decide)',
    falhou: (m: string) => `failed (${m})`,
    falhouAviso: 'failed (the toast says why)',
    foraDoFormato: 'unexpected format',
  },

  // /cadence stats
  gasto: {
    sessao: (u: string) => `Whole session (Claude Code ledger): ${u}`,
    auto: (p: number, r: number, u: string) => `Auto effort: ${p} prompts, ${r} requests, ${u} at API prices.`,
    linhaEsforco: (e: string, p: number, u: string) => `  ${e.padEnd(10)} ${String(p).padStart(3)} prompts  ${u}`,
    juizes: (v: number, quem: string, ms: number, u: string, s: number, p: number, f: number) =>
      `Judges: ${v} verdicts (${quem}), average ${ms} ms, ${u}; ${s} follow-ups and ${p} explicit asks without a judge` +
      (f ? `; ${f} times a fast judge failed and the next one decided.` : '.'),
    compactacoes: (h: number, s: number, f: number, antes: string, depois: string) =>
      `Compactions: ${h} by Haiku, ${s} by the chat model, ${f} Haiku failures. ${antes} → ${depois} tokens.`,
    economiaCompactar: (u: string, s: string) => `  Haiku cost ${u}; the chat model would cost ~${s} (estimate, warm cache).`,
    handoffs: (n: number) => `Handoffs: ${n}.`,
  },

  // /cadence bench
  bench: {
    cabecalho: '| Set | Cases | Correct | Too low | Too high | No answer | Judge median |',
    todos: 'All',
    holdout: 'Holdout',
    portugues: 'Portuguese',
    quem: (s: string) => `Who decided: ${s}.`,
    erros: 'Errors:',
    nenhumErro: 'No errors.',
    erro: (id: string, tipo: string, deu: string, ok: string, msg: string) => `- ${id} (${tipo}): gave ${deu}, accepted ${ok} — "${msg}"`,
    nada: 'nothing',
    titulo: (modo: string, quando: string) => `# Judge bench (${modo}), ${quando}`,
  },

  // compaction safety net and handoff message (the model reads these)
  rede: {
    editados: (n: number) => `Files edited in this conversation (${n}):`,
    naoCitado: ' (not mentioned above)',
    tarefas: 'Open tasks in the last list:',
    ultimoPedido: "The user's last request, verbatim:",
    titulo: "cadence safety net (taken from the transcript, no model):",
  },
  handoff: {
    esperar: 'Read this, tell me in two lines where things stand and what comes next, and wait for me.',
    continuar: 'Continue with the next step. If it is marked "needs user", say what you need and wait.',
    comSkill: (skill: string, texto: string, pede: string) =>
      `Handoff from the previous chat: it ran /${skill}, which saved the handoff. Its last words:\n\n${texto}\n\n` +
      `First read what /${skill} saved (the files named above, or HANDOFF.md at the project root). ${pede}`,
    simples: (texto: string, pede: string) => `Handoff from the previous chat:\n\n${texto}\n\n${pede}`,
  },
}

export type Textos = typeof EN

const PT: Textos = {
  locale: 'pt-BR',
  idiomaModelo: 'Brazilian Portuguese',
  esforco: { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máx' },
  esforcoTitulo: (e: string) => `Esforço ${e}`,
  juiz: { haiku: 'Haiku', jev: 'Jev', local: 'juiz local' },
  dias: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  mil: (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} milhão` : `${Math.round(n / 1000)} mil`),

  decidindo: 'decidindo…',
  pausado: 'pausado neste modelo',
  manual: (e: string) => `${e} (manual)`,
  esforcoManual: 'esforço manual',
  economia: 'economia',
  frio: 'frio',
  cacheFrio: 'cache frio',
  cacheRestam: (t: string) => `Cache, ${t} restantes`,
  compactaEm: (m: number) => `compacta em ${m} min`,
  compactaCurto: (m: number) => `compacta ${m}m`,
  ctxAlt: (pct: number, usados: string, total: string) => `Contexto ${pct}%, ${usados} de ${total}`,
  ctxSemMedida: 'Contexto ainda não medido',
  de: (total: string) => `de ${total}`,
  limiteAlt: (cinco: boolean, pct: number, renova: string) => `Limite de ${cinco ? '5 horas' : '7 dias'} em ${pct}%${renova ? `, renova ${renova}` : ''}`,
  as: (h: string) => `às ${h}`,
  btCompactar: 'Compactar',
  btNovo: 'Novo chat',
  btFechar: 'Dispensar',
  btEconomia: (ligada: boolean) => (ligada ? 'Desativar economia' : 'Ativar economia'),
  escrevendo: 'Escrevendo o resumo para o chat novo…',
  limpando: 'Abrindo o chat novo…',
  compactando: 'Compactando…',
  conselho: 'Chat novo renderia mais: ',
  frioChave: 'Cache frio: ',
  frioResto: (t: string) => `a próxima mensagem relê ${t} a preço cheio`,
  pesadoChave: 'Contexto pesado: ',
  pesadoResto: (t: string) => `cada mensagem relê ${t}`,
  limiteChave: (cinco: boolean, pct: number) => `Limite de ${cinco ? '5h' : '7 dias'} em ${pct}%`,
  limiteResto: (renova: string, econ: boolean) => `${renova ? ` · renova às ${renova}` : ''}${econ ? ' · economia ligada' : ''}`,

  falhouJuiz: (motivo: string) => `${motivo}; o Haiku decide`,
  semChave: 'o Jev não achou a chave da TypeSafe (opção typesafeKey ou TYPESAFE_API_KEY)',
  foraDoFormato: (j: string) => `o ${j} respondeu fora do formato`,
  porQueFalhou: (nome: string, s: number | 'tempo' | 'rede') =>
    s === 'tempo'
      ? `${nome} não respondeu a tempo`
      : s === 'rede'
        ? `${nome} não está acessível`
        : s === 401 || s === 403
          ? `${nome} recusou a chave (${s})`
          : s === 402
            ? `${nome} está sem créditos (${s})`
            : s === 404
              ? `${nome} não achou o modelo ou a rota (${s})`
              : s === 429
                ? `${nome} limitou as chamadas (${s})`
                : `${nome} falhou (${s})`,
  limiteRenovou: 'o limite renovou, modo economia desligado',
  compactado: 'conversa compactada',
  compactacaoFalhou: (e: string) => `a compactação falhou: ${e}`,
  haikuNaoCompactou: (m: string) => `o Haiku não compactou (${m}); o modelo do chat compacta`,
  longoDemais: 'o chat é longo demais para o Haiku',
  resumoVazio: 'o resumo veio vazio',
  jaEmAndamento: 'Já há um handoff ou compactação em andamento.',
  escrevendoCompleto: 'Escrevendo o handoff completo (confere o git e grava HANDOFF.md)…',
  escrevendoHandoff: 'Escrevendo o handoff…',
  handoffFalhou: (e: string) => `o handoff falhou: ${e}`,
  handoffCopiado: 'handoff copiado. Cole num chat novo.',
  handoffNaCaixa: 'a área de transferência recusou; o handoff está na caixa do prompt',
  handoffNaoEscrito: 'o handoff não foi escrito; nada foi limpo',
  voceEscolheu: (e: string) => `você escolheu ${e}; automático desligado. /cadence auto liga de novo`,
  skipPrecompute: 'o cadence compacta com o Haiku na hora',

  motivoPedido: 'você pediu',
  motivoSeguindo: 'seguindo',
  motivoEconomia: 'modo economia',
  motivoLimites: 'seus limites',
  motivoApp: 'sua escolha no app',
  certeza: (p: number) => `${p}% de certeza`,
  porQuem: { haiku: 'Haiku', jev: 'Jev', local: 'local', pedido: 'pedido', seguimento: 'seguimento', manual: 'manual' },

  autoLigado: 'Esforço automático ligado.',
  autoDesligado: 'Esforço automático desligado: vale o esforço do app.',
  economiaDesligada: 'Modo economia desligado.',
  economiaLigada: (ate: string) => `Modo economia ligado: esforço até médio até ${ate}.`,
  compactandoCmd: 'Compactando…',
  salvoEm: (a: string) => `Salvo em ${a}`,
  ajuda: [
    '/cadence                      o que está valendo agora',
    '/cadence auto                 liga ou desliga o esforço automático',
    '/cadence judge                testa cada juiz da fila e mostra a latência',
    '/cadence handoff [full] [continue|wait|copy]',
    '/cadence compact [o que o resumo deve manter]',
    '/cadence saver                esforço até médio até o limite renovar',
    '/cadence stats                o que foi medido nesta sessão',
    '/cadence bench [pt] [haiku|jev|local]   mede um juiz nos casos rotulados',
  ],
  status: {
    esforco: (auto: boolean, resto: string, pausado: boolean) => `Esforço: ${auto ? 'automático' : 'manual'}${resto}${pausado ? ', pausado neste modelo' : ''}`,
    contexto: (t: string, j: string) => `Contexto: ${t} de ${j}`,
    cache: (c: string, ttl: string) => `Cache: ${c} (vida ${ttl})`,
    semResposta: 'sem resposta ainda',
    juiz: (d: string) => `Juiz: ${d}`,
    compactacao: (haiku: boolean, ocioso: number) =>
      `Compactação: ${haiku ? 'Haiku + rede de segurança' : 'modelo do chat'}; parado ${ocioso ? `${ocioso} min` : 'desligado'}`,
    ajuda: '/cadence help lista os comandos.',
  },
  testeJuiz: {
    titulo: (d: string) => `Juiz ${d}`,
    respondeu: (e: string) => `respondeu ${e}`,
    duvida: 'respondeu, em dúvida (o Haiku decidiria)',
    falhou: (m: string) => `falhou (${m})`,
    falhouAviso: 'falhou (o aviso diz por quê)',
    foraDoFormato: 'fora do formato',
  },

  gasto: {
    sessao: (u: string) => `Sessão inteira (ledger do Claude Code): ${u}`,
    auto: (p: number, r: number, u: string) => `Esforço automático: ${p} prompts, ${r} requisições, ${u} a preço de API.`,
    linhaEsforco: (e: string, p: number, u: string) => `  ${e.padEnd(10)} ${String(p).padStart(3)} prompts  ${u}`,
    juizes: (v: number, quem: string, ms: number, u: string, s: number, p: number, f: number) =>
      `Juízes: ${v} vereditos (${quem}), média ${ms} ms, ${u}; ${s} seguimentos e ${p} pedidos explícitos sem juiz` +
      (f ? `; ${f} vezes um juiz rápido falhou e o seguinte decidiu.` : '.'),
    compactacoes: (h: number, s: number, f: number, antes: string, depois: string) =>
      `Compactações: ${h} pelo Haiku, ${s} pelo modelo do chat, ${f} falhas do Haiku. ${antes} → ${depois} tokens.`,
    economiaCompactar: (u: string, s: string) => `  Haiku custou ${u}; o modelo do chat custaria ~${s} (estimativa, cache quente).`,
    handoffs: (n: number) => `Handoffs: ${n}.`,
  },

  bench: {
    cabecalho: '| Conjunto | Casos | Acerto | Baixo demais | Alto demais | Sem resposta | Mediana do juiz |',
    todos: 'Todos',
    holdout: 'Holdout',
    portugues: 'Português',
    quem: (s: string) => `Quem decidiu: ${s}.`,
    erros: 'Erros:',
    nenhumErro: 'Nenhum erro.',
    erro: (id: string, tipo: string, deu: string, ok: string, msg: string) => `- ${id} (${tipo}): deu ${deu}, aceitos ${ok} — "${msg}"`,
    nada: 'nada',
    titulo: (modo: string, quando: string) => `# Bench do juiz (${modo}), ${quando}`,
  },

  rede: {
    editados: (n: number) => `Arquivos editados nesta conversa (${n}):`,
    naoCitado: ' (não citado acima)',
    tarefas: 'Tarefas abertas na última lista:',
    ultimoPedido: 'Último pedido do usuário, literal:',
    titulo: 'Rede de segurança do cadence (extraída da transcrição, sem modelo):',
  },
  handoff: {
    esperar: 'Leia isto, diga em duas linhas onde as coisas estão e o que vem a seguir, e espere por mim.',
    continuar: 'Continue com o próximo passo. Se ele estiver marcado "needs user", diga do que precisa e espere.',
    comSkill: (skill: string, texto: string, pede: string) =>
      `Handoff do chat anterior: ele rodou /${skill}, que salvou o handoff. As últimas palavras de lá:\n\n${texto}\n\n` +
      `Primeiro leia o que /${skill} salvou (os arquivos citados acima, ou HANDOFF.md na raiz do projeto). ${pede}`,
    simples: (texto: string, pede: string) => `Handoff do chat anterior:\n\n${texto}\n\n${pede}`,
  },
}

export const TEXTOS: Record<Lingua, Textos> = { en: EN, 'pt-BR': PT }

/** The live dictionary: modules import `T` and read it at call time, so a language change applies at once. */
export let T: Textos = EN
export function usarLingua(l: Lingua) {
  T = TEXTOS[l]
}
