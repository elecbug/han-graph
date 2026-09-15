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
  assert.equal(layout.nodes.length,15);
  assert.equal(layout.edges.length,13);
  assert.deepEqual(layout.nodes.filter(node=>node.root).map(node=>node.hanja),['感','覺']);
  assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>edge.word.hanja),['感覺']);
  assert(!layout.nodes.some(node=>node.hanja==='監'), 'do not expand the neighbors a second time');
  assert(layout.nodes.some(node=>node.hanja==='激'), 'include the newly connected 감격');
  assert(!layout.nodes.some(node=>node.hanja==='勵'), 'do not expand from 激 to 격려');
  assert(layout.nodes.some(node=>node.hanja==='愧'), 'include the newly connected 자괴감');
  assert(!layout.nodes.some(node=>node.hanja==='羞'), 'do not expand from 愧 to 수괴');
  assert.deepEqual(layout,layoutNetwork(network,selected), 'layout must be deterministic');
});

test('long compounds, duplicate readings, homographs and repeated glyphs retain identity', () => {
  for(const hanja of ['勇敢無雙','降伏','各各','康健','句句節節','兔死狗烹','龜裂','菊花茶','陸軍','旅券','阿鼻叫喚','跆拳道','糾正','規定','僅僅','僅僅扶持','千斤萬斤','極端','劇團','勤勉','僅免','禽獸','錦繡','利己','樂器','其間','期間','猜忌','時期','幾何級數','豈弟','許諾','難易度','娘娘','那落','奈落','女子','年度','寧日','喜怒哀樂','惱殺','泥土','綠茶','茶道','怒發大發','但書','端緖','但書條項','但願桑麻成','剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','冷淡','雪糖','砂糖','淡淡','堂堂','檀君神話','檀君朝鮮','荒唐無稽','地圖','指導','圖章','塗裝','矯導','敎徒','連帶','列島','挑戰狀','殺到','單刀直入','周到綿密','武陵桃源','待接','接待','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞','朗讀','洞察','洞窟','陸稻','督促狀','水稻作','稻熱病','陶瓷器','養豚場']) {
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
    if(hanja==='樂器')assert.equal(layout.nodes.find(node=>node.hanja==='樂').readings.length,2);
    for(const [word,glyph] of [['豈弟','豈'],['許諾','諾'],['難易度','易'],['娘娘','娘'],['奈落','奈'],['女子','女'],['年度','年'],['寧日','寧'],['喜怒哀樂','怒'],['惱殺','殺'],['泥土','泥'],['綠茶','綠'],['茶道','茶'],['弄談','弄'],['冷淡','冷'],['雪糖','糖'],['砂糖','糖'],['連帶','連'],['列島','列'],['挑戰狀','狀'],['殺到','殺'],['朗讀','朗'],['洞察','洞'],['洞窟','洞'],['陸稻','陸'],['督促狀','狀']]) {
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
    if(['剛斷','講壇','端正','斷定','短期','檀紀','文壇','文段','弄談','濃淡','正當','政黨','唐代','當代','地圖','指導','圖章','塗裝','矯導','敎徒','首都','水稻','顚倒','前途','獨自','讀者','冬至','同志','共同','空洞'].includes(hanja)) {
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(hanja==='但書條項') {
      assert.equal(edge.word.word,'단서 조항');
      assert.equal(edge.glyphs.length,4);
    }
    if(['單刀直入','周到綿密','武陵桃源'].includes(hanja))assert.equal(edge.glyphs.length,4);
    if(hanja==='待接'||hanja==='接待') {
      assert(layout.edges.some(item=>item.word.hanja==='待接'));
      assert(layout.edges.some(item=>item.word.hanja==='接待'));
      assert.equal(edge.word.hanja,hanja);
      assert.equal(layout.edges.filter(item=>item.current).length,1);
    }
    if(['水稻作','稻熱病','陶瓷器','養豚場','督促狀'].includes(hanja))assert.equal(edge.glyphs.length,3);
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
