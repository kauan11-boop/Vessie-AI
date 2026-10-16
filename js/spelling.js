// spelling.js — Corretor ortográfico autônomo PT-BR (100% local, sem rede).
// Ordem: 1.dicionário 2.autoCorrect 3.case
// Ex: autoCorrect('voce nao tem nocao') → 'você não tem noção'.
// Só corrige formas inequívocas (sem acento inválido, abreviações certas,
// erros clássicos e reforma ortográfica). Nunca toca em código, URLs ou e-mails.
import { state } from './state.js?v=7';

// Forma errada → forma certa (tudo minúsculo; o case original é preservado).
const CORRECTIONS = {
  // Acentuação inequívoca
  'voce': 'você', 'voces': 'vocês', 'nao': 'não', 'tambem': 'também',
  'entao': 'então', 'ja': 'já', 'so': 'só', 'ate': 'até', 'alem': 'além',
  'atraves': 'através', 'saude': 'saúde', 'remedio': 'remédio', 'cafe': 'café',
  'lapis': 'lápis', 'onibus': 'ônibus', 'arvore': 'árvore', 'maquina': 'máquina',
  'musica': 'música', 'noticia': 'notícia', 'policia': 'polícia', 'farmacia': 'farmácia',
  'historia': 'história', 'memoria': 'memória', 'inteligencia': 'inteligência',
  'experiencia': 'experiência', 'ciencia': 'ciência', 'consciencia': 'consciência',
  'paciencia': 'paciência', 'violencia': 'violência', 'infancia': 'infância',
  'importancia': 'importância', 'distancia': 'distância', 'elegancia': 'elegância',
  'ignorancia': 'ignorância', 'abundancia': 'abundância', 'resistencia': 'resistência',
  'existencia': 'existência', 'frequencia': 'frequência', 'sequencia': 'sequência',
  'potencia': 'potência', 'aparencia': 'aparência', 'carencia': 'carência',
  'audiencia': 'audiência', 'obediencia': 'obediência', 'competencia': 'competência',
  'inocencia': 'inocência', 'gerencia': 'gerência', 'vivencia': 'vivência',
  'ultimo': 'último', 'otimo': 'ótimo', 'pessimo': 'péssimo', 'facil': 'fácil',
  'dificil': 'difícil', 'util': 'útil', 'inutil': 'inútil', 'nivel': 'nível',
  'tunel': 'túnel', 'virus': 'vírus', 'bonus': 'bônus', 'onus': 'ônus',
  'saida': 'saída', 'caida': 'caída', 'atraido': 'atraído', 'distraido': 'distraído',
  'ruido': 'ruído', 'juizo': 'juízo', 'sao': 'são', 'alguem': 'alguém', 'ninguem': 'ninguém',
  'nocao': 'noção', 'privilegio': 'privilégio', 'analize': 'análise',
  // -ção / -são / -ções
  'acao': 'ação', 'reacao': 'reação', 'oracao': 'oração', 'solucao': 'solução',
  'questao': 'questão', 'atencao': 'atenção', 'coracao': 'coração',
  'informacao': 'informação', 'comunicacao': 'comunicação', 'educacao': 'educação',
  'opcao': 'opção', 'licao': 'lição', 'opcoes': 'opções', 'questoes': 'questões',
  'solucoes': 'soluções', 'informacoes': 'informações', 'excecao': 'exceção',
  'excessao': 'exceção', 'exelente': 'excelente',
  // Reforma ortográfica (sem acento): garante a forma nova mesmo se vier com acento antigo
  'idéia': 'ideia', 'vôo': 'voo', 'vêem': 'veem', 'lêem': 'leem', 'crêem': 'creem',
  'relêem': 'releem', 'jóia': 'joia', 'jibóia': 'jiboia', 'assembléia': 'assembleia',
  // Erros clássicos
  'concerteza': 'com certeza', 'derrepente': 'de repente',
  'mecher': 'mexer', 'geito': 'jeito', 'caza': 'casa', 'excessão': 'exceção',
  // Abreviações inequívocas
  'vc': 'você', 'vcs': 'vocês', 'tb': 'também', 'tbm': 'também', 'hj': 'hoje',
  'oq': 'o que', 'msg': 'mensagem', 'gnt': 'gente', 'td': 'tudo', 'blz': 'beleza',
  'vlw': 'valeu', 'flw': 'falou', 'cmg': 'comigo', 'ctg': 'contigo',
  'mto': 'muito', 'mt': 'muito', 'obg': 'obrigado', 'ngm': 'ninguém'
};

// Trechos protegidos: blocos cercados, código inline, URLs e e-mails.
const PROTECTED = /(```[\s\S]*?```|`[^`\n]+`|https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+)/g;

function applyCase(original, fixed) {
  if (original === original.toUpperCase() && /[A-ZÃÕÇÁÉÍÓÚÂÊÔÀÜ]/i.test(original)) {
    return fixed.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return fixed[0].toUpperCase() + fixed.slice(1);
  }
  return fixed;
}

// Corrige de forma escondida. Respeita a chave state.settings.spellcheck.
export function autoCorrect(text) {
  if (!text) return text;
  try {
    if (state.settings && state.settings.spellcheck === false) return text;
  } catch (e) {}
  const parts = [];
  let last = 0, m;
  PROTECTED.lastIndex = 0;
  while ((m = PROTECTED.exec(text))) {
    parts.push({ t: text.slice(last, m.index), code: false });
    parts.push({ t: m[0], code: true });
    last = m.index + m[0].length;
  }
  parts.push({ t: text.slice(last), code: false });
  return parts.map(p => {
    if (p.code) return p.t;
    return p.t.replace(/[\p{L}\p{N}]+/gu, word => {
      const hit = CORRECTIONS[word.toLowerCase()];
      return hit ? applyCase(word, hit) : word;
    });
  }).join('');
}
