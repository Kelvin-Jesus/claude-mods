import { expect, test } from 'claude-code/testing'

import { chaveDoEnv, corpoOpenAI, corpoSystemone, destinoLocal, INCERTO, lerOpenAI, lerSystemone, modeloLocal, ordemJuizes, porQueFalhou } from '../hooks/juizes'

test('fila de juízes: o Haiku sempre fecha; no auto, local antes do Jev', () => {
  expect(ordemJuizes('auto', false, false)).toEqual(['haiku'])
  expect(ordemJuizes('auto', true, true)).toEqual(['local', 'jev', 'haiku'])
  expect(ordemJuizes('auto', false, true)).toEqual(['jev', 'haiku'])
  expect(ordemJuizes('haiku', true, true)).toEqual(['haiku'])
  expect(ordemJuizes('jev', false, false)).toEqual(['jev', 'haiku'])
  expect(ordemJuizes('local', false, false)).toEqual(['local', 'haiku'])
})

test('local target: Ollaya by default, any /v1/systemone server, chat models only by explicit URL', () => {
  expect(destinoLocal('')).toEqual({ url: 'http://127.0.0.1:11435/v1/systemone', formato: 'systemone' })
  expect(destinoLocal('http://127.0.0.1:11434')).toEqual({ url: 'http://127.0.0.1:11434/v1/systemone', formato: 'systemone' })
  expect(destinoLocal('http://127.0.0.1:11434/v1/')).toEqual({ url: 'http://127.0.0.1:11434/v1/systemone', formato: 'systemone' })
  expect(destinoLocal('http://localhost:7777/v1/systemone')).toEqual({ url: 'http://localhost:7777/v1/systemone', formato: 'systemone' })
  expect(destinoLocal('http://127.0.0.1:8080/v1/chat/completions')).toEqual({ url: 'http://127.0.0.1:8080/v1/chat/completions', formato: 'openai' })
  expect(modeloLocal('', 'systemone')).toBe('laya:multilingual')
  expect(modeloLocal(' winnow:e4b ', 'systemone')).toBe('winnow:e4b')
})

test('systemone: lê a escolha e a certeza; abaixo de 50% é dúvida', () => {
  expect(lerSystemone('{"answers":{"effort":{"choice":"high","confidence":0.82}}}')).toEqual({ esforco: 'high', certeza: 0.82, motivo: '82% sure' })
  expect(lerSystemone('{"result":{"answers":{"effort":{"choice":"low","probabilities":{"low":0.7}}}}}')).toEqual({ esforco: 'low', certeza: 0.7, motivo: '70% sure' })
  expect(lerSystemone('{"answers":{"effort":{"choice":"max","confidence":0.3}}}')).toBe(INCERTO)
  expect(lerSystemone('{"answers":{"effort":{"choice":"turbo"}}}')).toBe(undefined)
  expect(lerSystemone('<html>502</html>')).toBe(undefined)
  const corpo = JSON.parse(corpoSystemone('jev-latest', { modelo: 'claude-opus-5-5', esforco: 'medium', contexto: 'user: oi', mensagem: 'x'.repeat(5000) }))
  expect(corpo.state.current_model).toBe('opus')
  expect(corpo.state.next_message.length).toBe(4000)
  expect(Object.keys(corpo.questions.effort.criteria)).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

test('OpenAI: saída presa ao esquema e lida do content', () => {
  const corpo = JSON.parse(corpoOpenAI('tev1', 'pergunta'))
  expect(corpo.response_format.type).toBe('json_schema')
  expect(corpo.messages[1].content).toBe('pergunta')
  expect(lerOpenAI('{"choices":[{"message":{"content":"{\\"effort\\":\\"medium\\",\\"sure\\":0.8,\\"why\\":\\"edição\\"}"}}]}')?.esforco).toBe('medium')
  expect(lerOpenAI('{"error":"model not found"}')).toBe(undefined)
})

test('chave no .env e motivos de falha em palavras', () => {
  expect(chaveDoEnv('# jev\nTYPESAFE_API_KEY="ts_abc"\n')).toBe('ts_abc')
  expect(chaveDoEnv('OUTRA=1')).toBe(undefined)
  expect(porQueFalhou('Jev', 401)).toContain('refused the key')
  expect(porQueFalhou('local judge', 'rede')).toBe('local judge is not reachable')
  expect(porQueFalhou('local judge', 404)).toContain('did not find the model')
})
