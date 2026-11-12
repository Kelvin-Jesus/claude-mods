export type Esforco = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Quem julga o esforço: o Haiku pelo login da sessão, o Jev da TypeSafe, ou um modelo na própria máquina. */
export type NomeJuiz = 'haiku' | 'jev' | 'local'
export type ModoJuiz = 'auto' | NomeJuiz

/** O esforço em vigor e quem decidiu: o juiz, um pedido na mensagem, um "ok" que manteve, ou o usuário no app. */
export type Escolha = {
  esforco: Esforco
  motivo: string
  por: NomeJuiz | 'pedido' | 'seguimento' | 'manual'
  certeza?: number
}

/** O que o cadence mediu nesta sessão. */
export type Gasto = {
  prompts: number
  requisicoes: number
  usd: number
  porEsforco: Partial<Record<Esforco, { prompts: number; usd: number }>>
  juiz: {
    vezes: number
    ms: number
    usd: number
    seguimentos: number
    pedidos: number
    /** Vereditos por juiz, e as vezes que um juiz rápido falhou e o seguinte decidiu. */
    por: Partial<Record<NomeJuiz, number>>
    falhas: number
  }
  compactacoes: {
    haiku: number
    sessao: number
    falhas: number
    antes: number
    depois: number
    usd: number
    usdSessaoEstimado: number
  }
  handoffs: number
}

export type Ctx = { tokens: number | null; janela: number }

export type Limite = { kind: string; pct: number; resetsAt: string | null }

/** Os avisos fechados no ✕, e até quando ficam fora. */
export type Fechados = { frio: boolean; pantanoAte: number | null; conselho: string | null; quente: string | null }

declare module 'claude-code' {
  interface PluginState {
    cadence: {
      ctx: Ctx
      limites: Limite[]
      auto: boolean
      escolha: Escolha | null
      julgando: boolean
      /** O modelo da sessão não aceita troca de esforço sem perder o cache: o Auto espera. */
      pausado: boolean
      /** Minutos de cache quente (arredondado para cima); 0 frio; null antes da primeira resposta. */
      cacheMin: number | null
      cacheMemo: { expira: number; ttl: '5m' | '1h' } | null
      /** Minutos até a compactação por ociosidade, só na reta final; null fora dela. */
      compactaEm: number | null
      /** Por que o Haiku acha que um handoff compensa agora. */
      conselho: string | null
      /** Modo economia (esforço até médio) até este instante, em ms. */
      economiaAte: number | null
      etapa: 'escrevendo' | 'limpando' | 'compactando' | null
      fechados: Fechados
      gasto: Gasto
    }
  }
}
