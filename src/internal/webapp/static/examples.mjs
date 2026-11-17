// Show examples in the selected language without silently switching languages.
export function exampleLines(result, language = 'ko') {
  const lang=['ko','en','ru'].includes(language)?language:'ko';
  const text=result?.[lang==='ko'?'example':`example_${lang}`];
  return text?[{text,lang,secondary:false}]:[];
}
