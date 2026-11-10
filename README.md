# claude-mods

Mods para o Claude Code.

## contexto-pct

Mostra uma faixa acima do prompt com o quanto do contexto o chat atual já ocupa:

```
ctx ■ ■ ■ ■ ■ ■ ■ ■ □ □ □ □ □ □ □ □ □ □ □ □ 40% (140k/350k) · 5h 62%
```

- Barra de 20 quadradinhos, cada um valendo 17,5k tokens de um limite de 350k. A cor vai de verde a vermelho, e o vermelho forte só aparece perto dos 300k.
- A partir de 300k, aviso para rodar `/compact`.
- Depois de 1 hora sem mensagem e sem o agente trabalhando, compacta sozinho, pedindo ao resumo que preserve o plano, as tarefas abertas, as decisões e os caminhos de arquivo. Nos últimos 15 minutos a faixa mostra `compacta em Nmin`.
- No fim da linha, o uso da janela de 5 horas da assinatura.

A porcentagem é calculada sobre 350k. Para o autocompact do Claude Code usar esse mesmo limite, coloque no `env` do `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000" } }
```

### Instalar

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install contexto-pct --marketplace Kelvin-Jesus/claude-mods
```

Responda `y` para adicionar o marketplace e escolha o escopo. Num shell:

```
claude plugin install contexto-pct --marketplace Kelvin-Jesus/claude-mods
```

Em chats já abertos, rode `/reload-plugins`.
