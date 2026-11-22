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
export const wordCategory = word => WORD_LEVELS.includes(word.level) && word.level!=='all' ? word.level : 'normal';
export const PRACTICE_LEVELS = WORD_LEVELS.filter(level => level !== 'all');
export const practiceSettings = value => ({level:PRACTICE_LEVELS.includes(value?.level) ? value.level : 'easy'});

export function filterPracticeQuestions(questions, {level='easy'} = {}) {
  if (!PRACTICE_LEVELS.includes(level)) throw new RangeError('Invalid practice settings');
  return questions.filter(q => {
    if (q?.word_level!==level || !Array.isArray(q.options) || q.options.length<2 || q.options.length>4) return false;
    if (typeof q.answer?.word!=='string' || typeof q.answer?.hanja!=='string') return false;
    if (!q.options.every(option=>typeof option?.word==='string' && option.word.trim() && typeof option.hanja==='string')) return false;
    const labels = q.options.map(option => option.word.normalize('NFC').replace(/\s+/g,''));
    return new Set(labels).size===labels.length && q.options.some(option=>wordKey(option)===wordKey(q.answer));
  });
}

export function createSession(questions, random = Math.random, {level='easy'} = {}) {
  const pool = filterPracticeQuestions(questions, {level});
  const shuffled = values => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  // Prefer meaning contrasts while keeping two slots for the wider collection.
  // Different contrast groups expose a range of distinctions in each round.
  const contrasts = shuffled(pool.filter(q => q.contrast_group));
  const general = shuffled(pool.filter(q => !q.contrast_group));
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
  return {level, questions: shuffled(chosen).map(q => ({...q, options: shuffled(q.options)})), answers: new Map(), recorded: false};
}

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
    roundID:session.roundID, level:session.level,
    items:session.questions.map(q=>({
      id:q.id, options:q.options.map(wordKey), answer:wordKey(q.answer),
      selected:session.answers.has(q.id)?wordKey(session.answers.get(q.id).selected):null,
    })),
  };
}

export function restorePracticeDraft(draft, questions, owner) {
  if(typeof draft?.roundID!=='string' || !/^[0-9a-f]{32}$/.test(draft.roundID) || !PRACTICE_LEVELS.includes(draft.level) || !Array.isArray(draft.items))return null;
  const pool=filterPracticeQuestions(questions,{level:draft.level});
  if(!draft.items.length || draft.items.length!==Math.min(PRACTICE_SESSION_SIZE,pool.length))return null;
  const available=new Map(pool.map(q=>[q.id,q]));
  const session={owner,roundID:draft.roundID,level:draft.level,questions:[],answers:new Map(),recorded:false};
  for(const item of draft.items) {
    const question=available.get(item?.id);
    if(!question || item.answer!==wordKey(question.answer) || !Array.isArray(item.options) || item.options.length!==question.options.length)return null;
    available.delete(question.id);
    const choices=new Map(question.options.map(option=>[wordKey(option),option]));
    const options=item.options.map(key=>choices.get(key));
    if(options.includes(undefined) || new Set(options).size!==options.length)return null;
    const index=session.questions.length;
    session.questions.push({...question,options});
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
