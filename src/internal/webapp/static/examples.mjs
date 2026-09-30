// Korean mode pairs the source sentence with a smaller English translation.
// English mode shows English only, including for older datasets without one.
export function exampleLines(result, language = 'ko') {
  const ko=result?.example, en=result?.example_en;
  if(language==='en')return en?[{text:en,lang:'en',secondary:false}]:[];
  return [
    ...(ko?[{text:ko,lang:'ko',secondary:false}]:[]),
    ...(en?[{text:en,lang:'en',secondary:Boolean(ko)}]:[]),
  ];
}
