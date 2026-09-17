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
export const WORD_LEVELS = ['all', 'normal', 'classical'];
export const PRACTICE_DIFFICULTIES = ['all', 'easy', 'medium', 'hard'];

export function filterPracticeQuestions(questions, {difficulty='all', level='all'} = {}) {
  if (!WORD_LEVELS.includes(level) || !PRACTICE_DIFFICULTIES.includes(difficulty)) throw new RangeError('Invalid practice settings');
  return questions.filter(q => (difficulty==='all' || q.difficulty===difficulty) && (level==='all' || q.word_level===level));
}

export function createSession(questions, random = Math.random, {difficulty='all', level='all'} = {}) {
  const pool = filterPracticeQuestions(questions, {difficulty, level});
  const shuffled = values => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  return {difficulty, level, questions: shuffled(pool).slice(0, PRACTICE_SESSION_SIZE).map(q => ({...q, options: shuffled(q.options)})), answers: new Map(), recorded: false};
}

export function answerQuestion(session, index, selected) {
  const question = session.questions[index];
  if (!question || session.answers.has(question.id) || !question.options.some(option => wordKey(option) === wordKey(selected))) return false;
  session.answers.set(question.id, {selected, correct: wordKey(question.answer) === wordKey(selected)});
  return true;
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
