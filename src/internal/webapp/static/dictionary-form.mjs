import {LANGUAGES} from './localization.mjs';
import {WORD_TAGS} from './learning.mjs';
const han = glyph => /\p{Script=Han}/u.test(glyph);
export const WORD_FORM_FIELDS = ['word','hanja','level',...LANGUAGES.map(language=>`meaning_${language}`),...LANGUAGES.map(language=>`example_${language}`)];
export const emptyWordDraft = () => Object.fromEntries(WORD_FORM_FIELDS.map(field=>[field,field==='level'?'normal':'']));
export class WordFormError extends Error {
  constructor(code, field='', glyph='') { super(code); Object.assign(this,{code,field,glyph}); }
}
const text = (value,max,required,field) => {
  const result=String(value??'').trim();
  if((required&&!result)||[...result].length>max||/\p{Cc}/u.test(result))throw new WordFormError('wordFormInvalid',field);
  return result;
};

export function wordFormPayload(draft) {
  const word={word:text(draft.word,100,true,'word'),hanja:text(draft.hanja,100,false,'hanja'),level:draft.level};
  if(!['easy','normal','hard','classical'].includes(word.level))throw new WordFormError('wordFormInvalid','level');
  const spelling=[...word.word.replace(/\s/gu,'')], form=[...word.hanja];
  word.components=form.filter(han);
  if(draft.tags?.length) {
    if(!Array.isArray(draft.tags) || draft.tags.some(tag=>!WORD_TAGS.includes(tag)) || new Set(draft.tags).size!==draft.tags.length)throw new WordFormError('wordFormInvalid');
    if(draft.tags.includes('sajaseongeo') && (form.length!==4 || word.components.length!==4))throw new WordFormError('fourHanjaRequired','hanja');
    word.tags=[...draft.tags];
  }
  if(word.hanja&&(!word.components.length||form.some((glyph,index)=>!han(glyph)&&(form.length!==spelling.length||glyph!==spelling[index]||!/[가-힣]/u.test(glyph)))))throw new WordFormError('wordFormSpelling','hanja');
  for(const language of LANGUAGES) {
    const field=`meaning_${language}`,value=text(draft[field],2000,language==='ko',field);
    if(value)word[field]=value;
  }
  const examples={word:word.word,hanja:word.hanja};
  for(const language of LANGUAGES) {
    const field=`example_${language}`,value=text(draft[field],500,false,field);
    if(value)examples[field]=value;
  }
  if(LANGUAGES.some(language=>language!=='ko'&&examples[`example_${language}`])&&!examples.example_ko)throw new WordFormError('wordFormExample','example_ko');
  return {words:[word],characters:[],meta:[],examples:examples.example_ko?[examples]:[]};
}

// Registered glyphs require no extra input. Keep repeated components in the word.
export async function findMissingCharacters(word,lookup) {
  const glyphs=[...new Set(word.components)],missing=[];
  for(let offset=0;offset<glyphs.length;offset+=6) {
    const results=await Promise.all(glyphs.slice(offset,offset+6).map(async glyph=>({glyph,readings:await lookup(glyph)})));
    for(const {glyph,readings} of results)if(!readings.length) {
      const index=[...word.hanja].indexOf(glyph);
      const sound=[...word.word.replace(/\s/gu,'')][index]??'';
      missing.push({glyph,sound_ko:/^[가-힣]$/u.test(sound)?sound:'',sound_en:'',...Object.fromEntries(LANGUAGES.map(language=>[`meaning_${language}`,'']))});
    }
  }
  return missing;
}

export function addMissingCharacters(payload,drafts,groups,id=()=>String(9000+crypto.getRandomValues(new Uint32Array(1))[0])) {
  const result=structuredClone(payload), known=[...groups];
  const usedIDs=new Set(result.characters.map(character=>character.id));
  for(const draft of drafts) {
    const glyph=draft.glyph;
    const characterText=(value,max,required,field)=>{
      try {return text(value,max,required,field);}
      catch(error){error.glyph=glyph;throw error;}
    };
    const sound=characterText(draft.sound_ko,10,true,'sound_ko');
    if(!/^[가-힣]$/u.test(sound))throw new WordFormError('wordFormReading','sound_ko',glyph);
    let group=known.find(entry=>entry.sound_ko===sound);
    if(!group) {
      const roman=characterText(draft.sound_en,32,true,'sound_en').toLowerCase();
      if(!/^[a-z]+$/.test(roman)||known.some(entry=>entry.id===roman||entry.sound_en===roman))throw new WordFormError('wordFormReading','sound_en',glyph);
      group={type:'meta',id:roman,sound_ko:sound,sound_en:roman};known.push(group);result.meta.push(group);
    }
    let suffix=id();
    while(usedIDs.has(`${group.id}-${suffix}`))suffix=String(Number(suffix)+1);
    const character={type:'character',id:`${group.id}-${suffix}`,hanja:glyph};
    usedIDs.add(character.id);
    for(const language of LANGUAGES) {
      const field=`meaning_${language}`;
      const value=characterText(draft[field],200,language==='ko',field);
      if(value)character[field]=[value];
    }
    result.characters.push(character);
  }
  return result;
}
