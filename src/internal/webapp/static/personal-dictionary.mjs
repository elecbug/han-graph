export const DICTIONARY_FIELDS = ['words','characters','meta','examples'];
export const MAX_DICTIONARY_BYTES = 1024 * 1024;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class DictionaryInputError extends Error {
  constructor(code,field='',line=1) { super(code);Object.assign(this,{code,field,line}); }
}
// Accept a pretty JSON object, an array, or the repository's JSONL format.
export function parseDictionaryRecords(text,field) {
  const input=text.replace(/^\uFEFF/,'').trim();
  if(!input) return [];
  try {
    const parsed=JSON.parse(input),rows=Array.isArray(parsed)?parsed:[parsed];
    if(!rows.every(isRecord))throw new DictionaryInputError('dictionaryJSON',field);
    return rows;
  } catch(error) {
    if(error instanceof DictionaryInputError)throw error;
    const rows=[];
    for(const [i,line] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
      if(!line.trim())continue;
      let parsed;
      try {parsed=JSON.parse(line);}catch {throw new DictionaryInputError('dictionaryJSON',field,i+1);}
      if(!isRecord(parsed))throw new DictionaryInputError('dictionaryJSON',field,i+1);
      rows.push(parsed);
    }
    return rows;
  }
}
export function parseDictionaryInput(input) {
  if(DICTIONARY_FIELDS.reduce((sum,field)=>sum+new TextEncoder().encode(input[field]??'').length,0)>MAX_DICTIONARY_BYTES)throw new DictionaryInputError('dictionarySize');
  const data=Object.fromEntries(DICTIONARY_FIELDS.map(field=>[field,parseDictionaryRecords(input[field]??'',field)]));
  // The downloaded dictionary can also be pasted into the main input.
  const bundle=data.words.length===1?data.words[0]:null;
  if(bundle && !Object.hasOwn(bundle,'word') && DICTIONARY_FIELDS.some(field=>Object.hasOwn(bundle,field))) {
    if(Object.keys(bundle).some(field=>!DICTIONARY_FIELDS.includes(field)) || DICTIONARY_FIELDS.some(field=>Object.hasOwn(bundle,field) && (!Array.isArray(bundle[field]) || !bundle[field].every(isRecord))))throw new DictionaryInputError('dictionaryJSON','words');
    for(const field of DICTIONARY_FIELDS)data[field]=[...(bundle[field]??[]),...(field==='words'?[]:data[field])];
  }
  if(!DICTIONARY_FIELDS.some(field=>data[field].length))throw new DictionaryInputError('dictionaryEmpty');
  if(new TextEncoder().encode(JSON.stringify(data)).length>MAX_DICTIONARY_BYTES)throw new DictionaryInputError('dictionarySize');
  return data;
}
export const DICTIONARY_SAMPLE = {
  words:JSON.stringify({level:'normal',word:'학습노트',hanja:'學習노트',meaning_ko:'배운 내용을 정리하는 노트',meaning_en:'a notebook for organizing what you have learned',components:['學','習']},null,2),
  characters:JSON.stringify({type:'character',id:'seom-9000',hanja:'閃',meaning_ko:['번쩍이다'],meaning_en:['flash']},null,2),
  meta:JSON.stringify({type:'meta',id:'seom',sound_ko:'섬',sound_en:'seom'},null,2),
  examples:JSON.stringify({word:'학습노트',hanja:'學習노트',example_ko:'새로 배운 단어를 학습노트에 정리했어요.',example_en:'I organized the new words I learned in my study notebook.'},null,2),
};
