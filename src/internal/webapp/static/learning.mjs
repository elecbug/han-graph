export const wordKey = word => JSON.stringify([word.word, word.hanja]);

export function normalizeSaved(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(item => {
    if (!item || typeof item.word !== 'string' || typeof item.hanja !== 'string' || !item.word.trim() || item.word.length > 100 || item.hanja.length > 100) return false;
    const key = wordKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500).map(({word, hanja}) => ({word, hanja}));
}

export const PRACTICE_SESSION_SIZE = 10;
export const WORD_LEVELS = ['all', 'easy', 'normal', 'hard', 'classical'];
export const WORD_TAGS = ['sajaseongeo', 'gosaseongeo'];
export const matchesWordFilter = (word,level,tag) => (level==='all' || word.level===level) && (!tag || word.tags?.includes(tag));
export const wordCategory = word => WORD_LEVELS.includes(word.level) && word.level!=='all' ? word.level : 'normal';
export const PRACTICE_LEVELS = WORD_LEVELS.filter(level => level !== 'all');
export const practiceSettings = value => ({
  level:PRACTICE_LEVELS.includes(value?.level) ? value.level : 'easy',
  ...(WORD_TAGS.includes(value?.tag) ? {tag:value.tag} : {}),
});

export function filterPracticeQuestions(questions, {level='easy',tag=''} = {}) {
  if (!PRACTICE_LEVELS.includes(level) || (tag && !WORD_TAGS.includes(tag))) throw new RangeError('Invalid practice settings');
  return questions.filter(q => q?.word_level===level && (!tag || q.word_tags?.includes(tag)) && validPracticeQuestion(q));
}

function validPracticeQuestion(q) {
  if (!PRACTICE_LEVELS.includes(q?.word_level) || !Array.isArray(q.options) || q.options.length<2 || q.options.length>4) return false;
  if (typeof q.answer?.word!=='string' || typeof q.answer?.hanja!=='string') return false;
  if (!q.options.every(option=>typeof option?.word==='string' && option.word.trim() && typeof option.hanja==='string')) return false;
  const labels = q.options.map(option => option.word.normalize('NFC').replace(/\s+/g,''));
  return new Set(labels).size===labels.length && q.options.some(option=>wordKey(option)===wordKey(q.answer));
}

function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createSession(questions, random = Math.random, {level='easy',tag=''} = {}) {
  const pool = filterPracticeQuestions(questions, {level,tag});
  // Prefer meaning contrasts while keeping two slots for the wider collection.
  // Different contrast groups expose a range of distinctions in each round.
  const contrasts = shuffle(pool.filter(q => q.contrast_group), random);
  const general = shuffle(pool.filter(q => !q.contrast_group), random);
  const chosen = [], groups = new Set(), used = new Set(), answerKeys = new Set();
  const add = q => {
    chosen.push(q); used.add(q.id); answerKeys.add(wordKey(q.answer));
    if (q.contrast_group) groups.add(q.contrast_group);
  };
  const take = (candidates, limit, accepts = () => true) => {
    for (const q of candidates) {
      if (chosen.length>=limit) break;
      if (!used.has(q.id) && accepts(q)) add(q);
    }
  };
  const freshAnswer = q => !answerKeys.has(wordKey(q.answer));
  const freshGroup = q => !groups.has(q.contrast_group);
  const contrastCount = Math.min(8, PRACTICE_SESSION_SIZE);
  // Prefer new answers within different groups, then preserve group variety.
  take(contrasts, contrastCount, q => freshGroup(q) && freshAnswer(q));
  take(contrasts, contrastCount, freshGroup);
  take(contrasts, contrastCount, freshAnswer);
  take(contrasts, contrastCount);
  // Keep the general slots while avoiding answers already seen in this round.
  take(general, PRACTICE_SESSION_SIZE, freshAnswer);
  take(general, PRACTICE_SESSION_SIZE);
  take(contrasts, PRACTICE_SESSION_SIZE, freshAnswer);
  take(contrasts, PRACTICE_SESSION_SIZE);
  return {...practiceSettings({level,tag}), questions: shuffle(chosen, random).map(q => ({...q, options: shuffle(q.options, random)})), answers: new Map(), recorded: false};
}

export function createReviewSession(questions, targets, random = Math.random) {
  const used = new Set();
  const chosen = [];
  const byWord = new Map();
  const byID = new Map();
  for (const q of questions.filter(validPracticeQuestion)) {
    const key = wordKey(q.answer);
    if (!byWord.has(key)) byWord.set(key, []);
    byWord.get(key).push(q);
    byID.set(q.id, q);
  }
  for (const target of targets.slice(0, PRACTICE_SESSION_SIZE)) {
    if (!target?.answer || !validRoundID(target.round_id)) continue;
    const pool = (byWord.get(wordKey(target.answer)) ?? []).filter(q => !used.has(q.id));
    if (!pool.length) continue;
    const original = byID.get(target.question);
    const fresh = pool.filter(q => q.id !== target.question && (!original?.prompt_ko || q.prompt_ko !== original.prompt_ko));
    const choices = fresh.length ? fresh : pool;
    const q = choices[Math.floor(random() * choices.length)];
    used.add(q.id);
    chosen.push({...q, options:shuffle(q.options, random), sourceRound:target.round_id});
  }
  return {level:'review', questions:shuffle(chosen, random), answers:new Map(), recorded:false};
}

const validRoundID = value => typeof value==='string' && /^[0-9a-f]{32}$/.test(value);

export function answerQuestion(session, index, selected) {
  const question = session.questions[index];
  if (!question || session.answers.has(question.id) || !question.options.some(option => wordKey(option) === wordKey(selected))) return false;
  session.answers.set(question.id, {selected, correct: wordKey(question.answer) === wordKey(selected)});
  return true;
}

// Keep only the identities and ordering. Prompts, translations and scores
// always come from the current catalog when a round resumes.
export function practiceDraft(session) {
  return {
    roundID:session.roundID, level:session.level, ...(session.tag ? {tag:session.tag} : {}),
    items:session.questions.map(q=>({
      id:q.id, options:q.options.map(wordKey), answer:wordKey(q.answer),
      ...(session.level==='review' ? {source:q.sourceRound} : {}),
      selected:session.answers.has(q.id)?wordKey(session.answers.get(q.id).selected):null,
    })),
  };
}

export function restorePracticeDraft(draft, questions, owner) {
  if(!validRoundID(draft?.roundID) || !Array.isArray(draft.items))return null;
  const review=draft.level==='review';
  if(!review && !PRACTICE_LEVELS.includes(draft.level))return null;
  if(draft.tag!==undefined && (review || !WORD_TAGS.includes(draft.tag)))return null;
  const pool=review ? questions.filter(validPracticeQuestion) : filterPracticeQuestions(questions,draft);
  const count=draft.items.length;
  if(!count || count>PRACTICE_SESSION_SIZE || (!review && count!==Math.min(PRACTICE_SESSION_SIZE,pool.length)))return null;
  const available=new Map(pool.map(q=>[q.id,q]));
  const session={owner,roundID:draft.roundID,level:draft.level,...(draft.tag ? {tag:draft.tag} : {}),questions:[],answers:new Map(),recorded:false};
  for(const item of draft.items) {
    const question=available.get(item?.id);
    if(!question || item.answer!==wordKey(question.answer) || !Array.isArray(item.options) || item.options.length!==question.options.length)return null;
    available.delete(question.id);
    const choices=new Map(question.options.map(option=>[wordKey(option),option]));
    const options=item.options.map(key=>choices.get(key));
    if(options.includes(undefined) || new Set(options).size!==options.length)return null;
    const index=session.questions.length;
    if(review && !validRoundID(item.source))return null;
    session.questions.push({...question,options,...(review ? {sourceRound:item.source} : {})});
    if(item.selected!==null) {
      const selected=choices.get(item.selected);
      if(!selected || index!==session.answers.size || !answerQuestion(session,index,selected))return null;
    }
  }
  return session;
}

export function sessionResult(session) {
  const answers = session.questions.map(question => ({question, answer: session.answers.get(question.id)}));
  return {
    total: answers.length,
    answered: answers.filter(row => row.answer).length,
    correct: answers.filter(row => row.answer?.correct).length,
    mistakes: answers.filter(row => row.answer && !row.answer.correct).map(row => row.question),
    complete: answers.length > 0 && answers.every(row => row.answer),
  };
}
