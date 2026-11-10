export type Ctx = { tokens: number | null; window: number }

declare module 'claude-code' {
  interface PluginState {
    'contexto-pct': {
      ctx: Ctx
      /** Uso da janela de 5h da assinatura, 0 a 100; null sem leitura. */
      limite5h: number | null
      /** Minutos até o compact por ociosidade; null fora da contagem. */
      compactaEm: number | null
    }
  }
}
