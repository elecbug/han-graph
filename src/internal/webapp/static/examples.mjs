import {normalizeLanguage} from './localization.mjs';
// Show examples in the selected language without silently switching languages.
export function exampleLines(result, language = 'ko') {
  const lang=normalizeLanguage(language);
  const text=result?.[lang==='ko'?'example':`example_${lang}`];
  return text?[{text,lang,secondary:false}]:[];
}
