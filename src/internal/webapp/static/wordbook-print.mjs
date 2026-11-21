import {exampleLines} from './examples.mjs';
import {wordKey, wordCategory} from './learning.mjs';
import {localized, localizedDate, normalizeLanguage, copy as interfaceCopy} from './localization.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const copy = {
  ko: {
    title:'나의 단어 모음', subtitle:'뜻을 읽고, 구성을 살피고, 오래 기억하기.',
    count:count=>`${count}개의 단어`, missing:'현재 사전에서 설명을 찾을 수 없어요. 저장한 표기는 그대로 남겨 두었어요.',
    example:'예문', meaning:'뜻풀이', hint:'이해의 실마리', characters:'구성 한자',
    easy:'기초', normal:'일반', hard:'심화', classical:'고전',
    note:'한자의 뜻과 독음은 단어와 문맥에 따라 달라질 수 있어요.',
    footer:'하나의 단어에서 시작되는 새로운 이해.',
  },
  en: {
    title:'My word collection', subtitle:'Read the meaning. Notice the parts. Remember the connection.',
    count:count=>`${count} ${count===1?'word':'words'}`, missing:'The description is unavailable in the current dictionary. Your saved spelling is preserved here.',
    example:'Example', meaning:'Meaning', hint:'A clue to the meaning', characters:'Hanja components',
    easy:'Easy', normal:'General', hard:'Advanced', classical:'Classical',
    note:'A character’s meanings and readings can vary with the word and context.',
    footer:'A new understanding starts with one word.',
  },
  ru: {
    title:'Мой словарик', subtitle:'Прочитайте значение. Изучите состав. Запомните связь.',
    count:count=>`Слов: ${count}`, missing:'Описание отсутствует в текущем словаре. Сохранённое написание оставлено без изменений.',
    example:'Пример', meaning:'Значение', hint:'Подсказка к значению', characters:'Иероглифы в составе',
    easy:'Базовая', normal:'Общая', hard:'Продвинутая', classical:'Классическая',
    note:'Значения и чтения иероглифа зависят от слова и контекста.',
    footer:'Новое понимание начинается с одного слова.',
  },
  uz: {
    title:'Mening soʻzlarim', subtitle:'Maʼnoni oʻqing. Tarkibni oʻrganing. Bogʻlanishni eslab qoling.',
    count:count=>`${count} ta soʻz`, missing:'Joriy lugʻatda izoh topilmadi. Saqlangan yozuv oʻz holicha qoldirildi.',
    example:'Misol', meaning:'Maʼno', hint:'Maʼnoga ishora', characters:'Soʻz tarkibidagi iyerogliflar',
    easy:'Boshlangʻich', normal:'Umumiy', hard:'Murakkab', classical:'Klassik',
    note:'Iyeroglif maʼnosi va oʻqilishi soʻz hamda kontekstga qarab oʻzgarishi mumkin.',
    footer:'Yangi tushuncha bir soʻzdan boshlanadi.',
  },
  ky: {
    title:'Менин сөздөрүм', subtitle:'Маанисин окуңуз. Курамын караңыз. Байланышын эстеп калыңыз.',
    count:count=>`Сөздөр: ${count}`, missing:'Учурдагы сөздүктө түшүндүрмө жок. Сакталган жазылышы өзгөртүлгөн жок.',
    example:'Мисал', meaning:'Мааниси', hint:'Мааниге ишарат', characters:'Сөздүн курамындагы иероглифтер',
    easy:'Баштапкы', normal:'Жалпы', hard:'Татаал', classical:'Классикалык',
    note:'Иероглифтин мааниси жана окулушу сөзгө жана контекстке жараша өзгөрүшү мүмкүн.',
    footer:'Жаңы түшүнүк бир сөздөн башталат.',
  },
  zh: {
    title:'我的生词本', subtitle:'读懂词义，观察构成，记住词语间的联系。',
    count:count=>`${count}个词`, missing:'当前词典中暂无说明，已保留收藏时的写法。',
    example:'例句', meaning:'释义', hint:'理解提示', characters:'组成汉字',
    easy:'基础', normal:'一般', hard:'进阶', classical:'古典',
    note:'汉字的读音和意思会随词语和语境而变化。', footer:'从一个词开始新的理解。',
  },
  ja: {
    title:'私の単語帳', subtitle:'意味を読み、構成を見て、つながりを覚えましょう。',
    count:count=>`${count}語`, missing:'現在の辞書に説明がありません。保存した表記を表示しています。',
    example:'例文', meaning:'意味', hint:'理解のヒント', characters:'構成する漢字',
    easy:'初級', normal:'一般', hard:'上級', classical:'古典',
    note:'漢字の意味や読みは単語や文脈によって変わります。', footer:'理解の始まりは、一つの単語から。',
  },
  es: {
    title:'Mi colección de palabras', subtitle:'Lee el significado, observa las partes y recuerda su relación.',
    count:count=>`${count} ${count===1?'palabra':'palabras'}`, missing:'La descripción no está en el diccionario actual. Se conserva la grafía guardada.',
    example:'Ejemplo', meaning:'Significado', hint:'Pista para entender la palabra', characters:'Caracteres que la componen',
    easy:'Básico', normal:'General', hard:'Avanzado', classical:'Clásico',
    note:'El significado y la lectura de un carácter pueden variar según la palabra y el contexto.', footer:'Un nuevo aprendizaje empieza con una palabra.',
  },
  ne: {
    title:'मेरो शब्दसङ्ग्रह', subtitle:'अर्थ पढ्नुहोस्, बनोट हेर्नुहोस् र सम्बन्ध सम्झनुहोस्।',
    count:count=>count.toLocaleString('ne')+' शब्द', missing:'हालको शब्दकोशमा विवरण छैन। सुरक्षित हिज्जे देखाइएको छ।',
    example:'उदाहरण', meaning:'अर्थ', hint:'अर्थ बुझ्ने सङ्केत', characters:'शब्द बनाउने हान्जा',
    easy:'सजिलो', normal:'सामान्य', hard:'उन्नत', classical:'शास्त्रीय',
    note:'शब्द र प्रसङ्गअनुसार हान्जाको अर्थ र उच्चारण बदलिन सक्छ।', footer:'नयाँ बुझाइ एउटा शब्दबाट सुरु हुन्छ।',
  },
  mn: {
    title:'Миний үгийн сан', subtitle:'Утгыг уншиж, бүтцийг ажиглан, холбоог тогтоогоорой.',
    count:count=>count.toLocaleString('mn')+' үг', missing:'Одоогийн тольд тайлбар алга. Хадгалсан бичлэгийг харууллаа.',
    example:'Жишээ', meaning:'Утга', hint:'Утгын тайлбар', characters:'Үгийг бүтээх ханз',
    easy:'Хялбар', normal:'Ерөнхий', hard:'Ахисан', classical:'Сонгодог',
    note:'Ханзны утга, дуудлага нь үг болон хам сэдвээс шалтгаална.', footer:'Шинэ ойлголт нэг үгээс эхэлнэ.',
  },
  th: {
    title:'คลังคำของฉัน', subtitle:'อ่านความหมาย ดูอักษรที่ประกอบเป็นคำ แล้วจดจำความเชื่อมโยง',
    count:count=>count.toLocaleString('th')+' คำ', missing:'ไม่มีคำอธิบายในพจนานุกรมปัจจุบัน จึงแสดงรูปคำที่เก็บไว้',
    example:'ตัวอย่าง', meaning:'ความหมาย', hint:'คำใบ้ความหมาย', characters:'อักษรฮันจาที่ประกอบเป็นคำ',
    easy:'พื้นฐาน', normal:'ทั่วไป', hard:'ขั้นสูง', classical:'คลาสสิก',
    note:'ความหมายและเสียงอ่านของอักษรอาจเปลี่ยนไปตามคำและบริบท', footer:'ความเข้าใจใหม่เริ่มต้นจากคำหนึ่งคำ',
  },
  vi: {
    title:'Sổ từ của tôi', subtitle:'Đọc nghĩa, xem các chữ cấu thành và ghi nhớ mối liên hệ.',
    count:count=>`${count} từ`, missing:'Từ điển hiện tại chưa có phần giải thích. Cách viết đã lưu vẫn được giữ lại.',
    example:'Câu ví dụ', meaning:'Nghĩa', hint:'Gợi ý để hiểu nghĩa', characters:'Các chữ Hán cấu thành',
    easy:'Cơ bản', normal:'Phổ thông', hard:'Nâng cao', classical:'Cổ điển',
    note:'Nghĩa và âm đọc của chữ Hán có thể thay đổi theo từ và ngữ cảnh.', footer:'Mỗi từ mở ra một cách hiểu mới.',
  },
};

// Keep a successful font load for later previews; a failed load can be retried.
let printFontPromise;
export function loadWordbookPrintFont() {
  if(!printFontPromise) {
    const faces=[['Regular','400'],['SemiBold','600']].map(([name,weight])=>
      new FontFace('HanGraph Print',`url("/fonts/NotoSansKR-${name}.woff2")`,{
        weight,style:'normal',display:'swap',
      }));
    printFontPromise=Promise.all(faces.map(font=>font.load())).then(loaded=>{
      loaded.forEach(font=>document.fonts.add(font));
      return loaded;
    }).catch(error=>{printFontPromise=null;throw error;});
  }
  return printFontPromise;
}

// Query each spelling once, with at most six requests in flight. Preserve the
// original word/Hanja identity and order, including missing dictionary entries.
export async function loadPrintableWords(saved, getJSON, isCurrent = () => true) {
  const refs=saved.map(({word,hanja})=>({word,hanja}));
  const queries=[...new Set(refs.map(ref=>ref.word))], found=new Map();
  for(let i=0;i<queries.length;i+=6) {
    if(!isCurrent())return [];
    const results=await Promise.all(queries.slice(i,i+6).map(query=>getJSON('/api/words',query)));
    for(const matches of results)for(const result of matches)found.set(wordKey(result.word),result);
  }
  return refs.map(ref=>({ref, result:found.get(wordKey(ref))??null}));
}

export function wordbookPrintFilename(date = new Date()) {
  const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  return `han-graph-words-${stamp}`;
}

function wordForm(value) {
  return Array.from(value??'').map(glyph=>/\p{Script=Han}/u.test(glyph)
    ? `<strong>${escape(glyph)}</strong>` : `<span>${escape(glyph)}</span>`).join('');
}

function characterDetails(components, language) {
  return components.map(component=>`<span class="print-character"><span class="print-glyph" lang="ko">${escape(component.hanja)}</span>${component.readings.map(reading=>`<span class="print-reading">[<strong lang="ko">${escape(reading.sound_ko)}</strong>/<span lang="en">${escape(reading.sound_en)}</span>] <span lang="${language}">${escape(localized(reading,'meaning',language).join(', '))}</span></span>`).join(' / ')}</span>`).join(' · ');
}

export function renderPrintableWordbook(entries, {lang='ko', date=new Date()} = {}) {
  const language=normalizeLanguage(lang), labels=copy[language];
  const dateLabel=localizedDate(date,language);
  const counts=new Map();
  for(const {result} of entries)if(result)counts.set(wordCategory(result.word),(counts.get(wordCategory(result.word))??0)+1);
  const categories=['easy','normal','hard','classical'].filter(level=>counts.has(level));
  return `<section class="print-sheet" aria-label="${labels.title}">
    <header class="print-cover"><div class="print-masthead"><span>漢—GRAPH</span><span>${interfaceCopy[language].brandMotto}</span></div>
      <p class="print-eyebrow">${interfaceCopy[language].savedEye}</p><h1>${labels.title}</h1><p class="print-subtitle">${labels.subtitle}</p>
      <div class="print-meta"><strong>${labels.count(entries.length)}</strong><span>${escape(dateLabel)}</span></div>
      ${categories.length?`<p class="print-categories">${categories.map(level=>`${labels[level]} ${counts.get(level)}`).join(' · ')}</p>`:''}
    </header>
    <ol class="print-entries">${entries.map(({ref,result},index)=>{
      const word=result?.word??ref;
      return `<li class="print-entry"><article>
        <header class="print-entry-heading"><span class="print-number">${String(index+1).padStart(2,'0')}</span><div class="print-word-title"><h2 lang="ko">${escape(word.word)}</h2>${word.hanja?`<p class="print-word-form" lang="ko">${wordForm(word.hanja)}</p>`:''}</div>${result?`<span class="print-level">${labels[wordCategory(word)]}</span>`:''}</header>
        <div class="print-entry-content">${result?`<div class="print-definition"><h3>${labels.meaning}</h3><p lang="${language}">${escape(localized(word,'meaning',language))}</p></div>
          ${exampleLines(result,language).length?`<div class="print-hint print-example"><h3>${labels.example}</h3>${exampleLines(result,language).map(line=>`<p lang="${line.lang}" class="${line.secondary?'example-translation':'example-primary'}">${escape(line.text)}</p>`).join('')}</div>`:''}
          ${localized(word,'semantic_hint',language)?`<div class="print-hint"><h3>${labels.hint}</h3><p lang="${language}">${escape(localized(word,'semantic_hint',language))}</p></div>`:''}
          ${result.components?.length?`<div class="print-breakdown"><h3>${labels.characters}</h3> | <div class="print-characters">${characterDetails(result.components,language)}</div></div>`:''}`
          :`<p class="print-missing">${labels.missing}</p>`}</div>
      </article></li>`;
    }).join('')}</ol>
    <footer class="print-colophon"><p>${labels.note}</p><div><strong>漢—GRAPH</strong><span>${labels.footer}</span></div></footer>
  </section>`;
}
