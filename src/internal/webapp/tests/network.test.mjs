import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutNetwork, edgePaths, renderNetworkSVG} from '../static/network.mjs';

const read=name=>fs.readFileSync(new URL(`../../../../dataset/${name}`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const words=read('normal_word.jsonl'), characters=read('character.jsonl');
function neighborhood(selected) {
  const roots=[...new Set(selected.components)];
  const connected=words.filter(word=>word.components.some(glyph=>roots.includes(glyph)));
  const glyphs=[...new Set([...roots,...connected.flatMap(word=>word.components)])];
  return {roots,words:connected,characters:glyphs.map(hanja=>({hanja,readings:characters.filter(c=>c.hanja===hanja)}))};
}

test('all direct neighbors are laid out once, with a clickable edge per word', () => {
  const selected=words.find(word=>word.hanja==='感覺');
  const network=neighborhood(selected), layout=layoutNetwork(network,selected);
  assert.equal(layout.nodes.length,21);
  assert.equal(layout.edges.length,16);
  assert.deepEqual(layout.nodes.filter(node=>node.root).map(node=>node.hanja),['感','覺']);
  assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>edge.word.hanja),['感覺']);
  assert(!layout.nodes.some(node=>node.hanja==='監'), 'do not expand the neighbors a second time');
  assert(layout.nodes.some(node=>node.hanja==='激'), 'include the newly connected 감격');
  assert(!layout.nodes.some(node=>node.hanja==='勵'), 'do not expand from 激 to 격려');
  assert(layout.nodes.some(node=>node.hanja==='愧'), 'include the newly connected 자괴감');
  assert(!layout.nodes.some(node=>node.hanja==='羞'), 'do not expand from 愧 to 수괴');
  assert(layout.nodes.some(node=>node.hanja==='鈍'), 'include the newly connected 둔감');
  assert(!layout.nodes.some(node=>node.hanja==='愚'), 'do not expand from 鈍 to 우둔');
  for(const glyph of ['淸','涼','諒','解','書'])assert(layout.nodes.some(node=>node.hanja===glyph), 'include 청량감 and 양해각서');
  for(const glyph of ['荒','恕'])assert(!layout.nodes.some(node=>node.hanja===glyph), 'do not expand the new neighbors again');
  assert.deepEqual(layout,layoutNetwork(network,selected), 'layout must be deterministic');
});

test('long compounds, duplicate readings, homographs and repeated glyphs retain identity', () => {
  for(const hanja of ['勇敢無雙','降伏','各各','康健','句句節節','兔死狗烹','龜裂','菊花茶','陸軍','旅券','阿鼻叫喚','跆拳道','糾正','規定','僅僅','僅僅扶持','千斤萬斤','極端','劇團','勤勉','僅免','禽獸','錦繡','利己','樂器','其間','期間','猜忌','時期','幾何級數','豈弟','許諾','難易度','娘娘','那落','奈落','女子','年度','寧日','喜怒哀樂','惱殺','泥土','綠茶','茶道','怒發大發','但書','端緖','但書條項','但願桑麻成','剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','冷淡','雪糖','砂糖','淡淡','堂堂','檀君神話','檀君朝鮮','荒唐無稽','地圖','指導','圖章','塗裝','矯導','敎徒','連帶','列島','挑戰狀','殺到','單刀直入','周到綿密','武陵桃源','待接','接待','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞','朗讀','洞察','洞窟','陸稻','督促狀','水稻作','稻熱病','陶瓷器','養豚場','同時','童詩','凍傷','銅像','段落','短絡','産卵','散亂','漏斗','羅列','網羅','娛樂','樂園','樂觀','落下','下落','卵子','亂離','欄干','空欄','鈍感','北斗七星','森羅萬象','冷凍庫','連絡處','廣告欄','蘭草','春蘭','東洋蘭','濫用','氾濫','浪費','風浪','郞君','新郞','花郞','花郞徒','畫廊','廊下','來日','掠奪','擄掠','掠奪品','省略','略圖','兩分','涼風','淸涼感','良心','棟梁','梁木','梁上君子','糧食','食糧','軍糧米','諒解','海諒','諒解覺書','念慮','旅行','奬勵金']) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert.equal(new Set(layout.nodes.map(node=>node.hanja)).size,layout.nodes.length);
    const edge=layout.edges.find(edge=>edge.current);
    assert.deepEqual(edge.word.components,selected.components);
    if(hanja==='勇敢無雙')assert.equal(edge.glyphs.length,4);
    if(hanja==='降伏')assert.equal(layout.nodes.find(node=>node.hanja==='降').readings.length,2);
    if(hanja==='龜裂')assert.equal(layout.nodes.find(node=>node.hanja==='龜').readings.length,3);
    if(hanja==='菊花茶')assert.equal(layout.nodes.find(node=>node.hanja==='茶').readings.length,2);
    if(hanja==='陸軍')assert.equal(layout.nodes.find(node=>node.hanja==='陸').readings.length,2);
    if(hanja==='旅券')assert.equal(layout.nodes.find(node=>node.hanja==='旅').readings.length,2);
    if(hanja==='利己')assert.equal(layout.nodes.find(node=>node.hanja==='利').readings.length,2);
    if(['樂器','娛樂','樂園','樂觀'].includes(hanja))assert.equal(layout.nodes.find(node=>node.hanja==='樂').readings.length,3);
    for(const [word,glyph] of [['豈弟','豈'],['許諾','諾'],['難易度','易'],['娘娘','娘'],['奈落','奈'],['女子','女'],['年度','年'],['寧日','寧'],['喜怒哀樂','怒'],['惱殺','殺'],['泥土','泥'],['綠茶','綠'],['茶道','茶'],['弄談','弄'],['冷淡','冷'],['雪糖','糖'],['砂糖','糖'],['連帶','連'],['列島','列'],['挑戰狀','狀'],['殺到','殺'],['朗讀','朗'],['洞察','洞'],['洞窟','洞'],['陸稻','陸'],['督促狀','狀'],['漏斗','漏'],['羅列','羅'],['網羅','羅'],['落下','落'],['下落','落'],['卵子','卵'],['産卵','卵'],['亂離','亂'],['散亂','亂'],['欄干','欄'],['空欄','欄'],['蘭草','蘭'],['濫用','濫'],['浪費','浪'],['郞君','郞'],['花郞','郞'],['畫廊','廊'],['廊下','廊'],['來日','來'],['掠奪','掠'],['擄掠','掠'],['省略','省'],['略圖','略'],['兩分','兩'],['涼風','涼'],['淸涼感','涼'],['良心','良'],['棟梁','梁'],['梁木','梁'],['糧食','糧'],['食糧','糧'],['諒解','諒'],['海諒','諒'],['念慮','念']]) {
      if(hanja===word)assert.equal(layout.nodes.find(node=>node.hanja===glyph).readings.length,2);
    }
    if(hanja==='那落'||hanja==='奈落') {
      assert.equal(layout.edges.filter(item=>item.word.word==='나락').length,2);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
      assert.equal(edge.word.hanja,hanja);
    }
    if(hanja==='其間'||hanja==='期間') {
      assert.equal(layout.edges.filter(item=>item.word.word==='기간').length,2);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
      assert.equal(edge.word.hanja,hanja);
    }
    if(['各各','僅僅','娘娘','淡淡','堂堂'].includes(hanja)) {
      assert.deepEqual(edge.glyphs,[selected.components[0]]);
      const paths=edgePaths(edge,layout.nodes);
      assert.equal(paths.length,2);
      assert.notEqual(paths[0],paths[1], 'a repeated glyph needs a visible loop');
    }
    if(hanja==='康健')assert.equal(layout.edges.filter(edge=>edge.word.word==='강건').length,2);
    if(['僅僅扶持','千斤萬斤','怒發大發'].includes(hanja)) {
      assert.equal(edge.glyphs.length,3);
      assert.equal(edge.word.components.length,4);
      assert.equal(layout.edges.filter(item=>item.word.hanja===hanja).length,1);
    }
    if(hanja==='句句節節') {
      assert.deepEqual(edge.glyphs,['句','節']);
      assert.deepEqual(edge.word.components,['句','句','節','節']);
      assert.equal(layout.edges.filter(item=>item.word.hanja===hanja).length,1);
    }
    if(hanja==='但書'||hanja==='端緖') {
      assert.equal(edge.word.word,'단서');
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(['剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','地圖','指導','圖章','塗裝','矯導','敎徒','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞','同時','童詩','凍傷','銅像','段落','短絡','産卵','散亂','花郞','畫廊'].includes(hanja)) {
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(hanja==='但書條項') {
      assert.equal(edge.word.word,'단서 조항');
      assert.equal(edge.glyphs.length,4);
    }
    if(['單刀直入','周到綿密','武陵桃源','北斗七星','森羅萬象','梁上君子','諒解覺書'].includes(hanja))assert.equal(edge.glyphs.length,4);
    if(hanja==='待接'||hanja==='接待') {
      assert(layout.edges.some(item=>item.word.hanja==='待接'));
      assert(layout.edges.some(item=>item.word.hanja==='接待'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(hanja==='落下'||hanja==='下落') {
      assert(layout.edges.some(item=>item.word.hanja==='落下'));
      assert(layout.edges.some(item=>item.word.hanja==='下落'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(['水稻作','稻熱病','陶瓷器','養豚場','督促狀','冷凍庫','連絡處','廣告欄','東洋蘭','花郞徒','掠奪品','淸涼感','軍糧米','奬勵金'].includes(hanja))assert.equal(edge.glyphs.length,3);
    if(hanja==='糧食'||hanja==='食糧') {
      assert(layout.edges.some(item=>item.word.hanja==='糧食'));
      assert(layout.edges.some(item=>item.word.hanja==='食糧'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(hanja==='但願桑麻成')assert.equal(edge.glyphs.length,5);
  }
});

test('every dataset word has finite, unclipped positions without overlapping labels', () => {
  for(const selected of words) {
    const layout=layoutNetwork(neighborhood(selected),selected);
    const elements=[...layout.nodes,...layout.edges];
    for(const item of elements) {
      assert(Number.isFinite(item.x)&&Number.isFinite(item.y),selected.hanja);
      assert(item.x-item.width/2>=0 && item.x+item.width/2<=layout.width,selected.hanja);
      assert(item.y-item.height/2>=0 && item.y+item.height/2<=layout.height,selected.hanja);
    }
    for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++) {
      const a=elements[i],b=elements[j];
      const overlapX=(a.width+b.width)/2-Math.abs(a.x-b.x);
      const overlapY=(a.height+b.height)/2-Math.abs(a.y-b.y);
      assert(overlapX<=0||overlapY<=0,`${selected.hanja}: ${a.id} overlaps ${b.id}`);
    }
  }
});

test('words sharing Hanja retain separate selection and detail links', () => {
  for (const name of ['갱신','경신']) {
    const selected=words.find(word=>word.word===name && word.hanja==='更新');
    const layout=layoutNetwork(neighborhood(selected),selected);
    const shared=layout.edges.filter(edge=>edge.word.hanja==='更新');
    assert.deepEqual(shared.map(edge=>edge.word.word),['갱신','경신']);
    assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>edge.word.word),[name]);
    assert.equal(layout.nodes.find(node=>node.hanja==='更').readings.length,2);
    const svg=renderNetworkSVG(layout);
    for (const edge of shared) {
      const href=`#explore?${new URLSearchParams({word:edge.word.word,hanja:edge.word.hanja})}`.replaceAll('&','&amp;');
      assert.equal(svg.split(`href="${href}"`).length-1,2, 'edge line and label must preserve both word and Hanja');
    }
  }
});

test('an isolated character still appears, without invented edges', () => {
  const layout=layoutNetwork({roots:['綱'],characters:[{hanja:'綱',readings:[]}],words:[]});
  assert.equal(layout.nodes.length,1);
  assert.equal(layout.edges.length,0);
});

test('every character, edge label and edge line links to the correct detail route', () => {
  const selected=words.find(word=>word.hanja==='感覺');
  const layout=layoutNetwork(neighborhood(selected),selected);
  const svg=renderNetworkSVG(layout,{highlighted:'感'});
  const anchors=[...svg.matchAll(/<a\s+([^>]+)>/g)].map(match=>match[1]);
  const nodeLinks=anchors.filter(attributes=>attributes.includes('data-node-glyph='));
  const labelLinks=anchors.filter(attributes=>attributes.includes('data-edge-word='));
  const lineLinks=anchors.filter(attributes=>attributes.includes('network-line-link'));
  assert.equal(nodeLinks.length,layout.nodes.length);
  assert.equal(labelLinks.length,layout.edges.length);
  assert.equal(lineLinks.length,layout.edges.length);
  function params(attributes) {
    const href=attributes.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');
    assert(href.startsWith('#explore?'));
    return new URLSearchParams(href.split('?')[1]);
  }
  nodeLinks.forEach((link,index)=>assert.equal(params(link).get('character'),layout.nodes[index].hanja));
  for(const links of [labelLinks,lineLinks]) links.forEach((link,index)=>{
    assert.equal(params(link).get('word'),layout.edges[index].word.word);
    assert.equal(params(link).get('hanja'),layout.edges[index].word.hanja);
  });
  // Dataset text must never create extra elements or attributes in the SVG.
  layout.edges[0].word={...layout.edges[0].word,word:'"<script>alert(1)</script>',meaning_en:'<img src=x onerror=alert(1)>'};
  const escaped=renderNetworkSVG(layout,{lang:'en'});
  assert(!escaped.includes('<script>')&&!escaped.includes('<img'));
  assert(escaped.includes('&lt;script&gt;'));
});
