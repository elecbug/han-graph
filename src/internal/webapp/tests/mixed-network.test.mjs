import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutNetwork, renderNetworkSVG, wordFormParts, filterNetwork} from '../static/network.mjs';
import {segmentHitsBox} from '../static/network-routing.mjs';

const read=name=>fs.readFileSync(new URL(`../../../../dataset/${name}.jsonl`,import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const words=read('word'), characters=read('character');
function neighborhood(selected) {
  const roots=[...new Set(selected.components)];
  const connected=words.filter(word=>word.components.some(glyph=>roots.includes(glyph)));
  const glyphs=[...new Set(connected.flatMap(word=>word.components))];
  return {roots,words:connected,characters:glyphs.map(hanja=>({hanja,readings:characters.filter(c=>c.hanja===hanja)}))};
}
function assertGeometry(layout) {
  const items=[...layout.nodes,...layout.edges];
  for(const item of items) {
    assert(Number.isFinite(item.x)&&Number.isFinite(item.y));
    assert(item.x>=item.width/2&&item.x+item.width/2<=layout.width);
    assert(item.y>=item.height/2&&item.y+item.height/2<=layout.height);
  }
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++) {
    const a=items[i],b=items[j];
    assert(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2,'overlapping graph labels');
  }
  for(const edge of layout.edges)for(const route of edge.routes) {
    const obstacles=items.filter(item=>item!==edge&&item.hanja!==route.glyph);
    for(let i=1;i<route.points.length;i++)for(const item of obstacles) {
      const box={left:item.x-item.width/2,right:item.x+item.width/2,top:item.y-item.height/2,bottom:item.y+item.height/2};
      assert(!segmentHitsBox(route.points[i-1],route.points[i],box),'connection crosses another label');
    }
  }
}

test('color words stay near 色 with full labels and valid routes',()=>{
  for(const name of ['검은색','노란색','빨간색','파란색','흰색','색깔','색']) {
    const selected=words.find(word=>word.word===name&&word.components.length===1);
    const network=neighborhood(selected),layout=layoutNetwork(network,selected);
    const root=layout.nodes.find(node=>node.hanja==='色');
    assert.equal(layout.edges.length,network.words.length);
    assert.deepEqual(layout.nodes.map(node=>node.hanja).sort(),network.characters.map(node=>node.hanja).sort());
    for(const edge of layout.edges.filter(edge=>edge.glyphs.length===1)) {
      assert(Math.hypot(edge.x-root.x,edge.y-root.y)<300,`${edge.word.word} forms a long dangling branch`);
      assert.equal(edge.routes.length,1);
    }
    assertGeometry(layout);
    const svg=renderNetworkSVG(layout);
    assert(svg.includes(`>${name}</text>`));
    assert(svg.includes('aria-current="true"'));
  }
});

test('one-character selected labels do not depend on their global word index',()=>{
  const selected=words.find(word=>word.word==='검은색'),network=neighborhood(selected);
  const positions=[network.words,[...network.words].reverse()].map(order=>{
    const layout=layoutNetwork({...network,words:order},selected);
    const root=layout.nodes.find(node=>node.hanja==='色'),edge=layout.edges.find(edge=>edge.current);
    return {x:edge.x-root.x,y:edge.y-root.y};
  });
  assert.deepEqual(positions[0],positions[1]);
});

test('mixed word forms preserve Korean prefixes and suffixes in readable, escaped labels',()=>{
  for(const [name,form,parts] of [
    ['검은색','검은色',[{text:'검은',hanja:false},{text:'色',hanja:true}]],
    ['칫솔','齒솔',[{text:'齒',hanja:true},{text:'솔',hanja:false}]],
    ['부모님','父母님',[{text:'父母',hanja:true},{text:'님',hanja:false}]],
  ]) {
    const selected=words.find(word=>word.word===name);
    assert.deepEqual(wordFormParts(selected),parts);
    const network=filterNetwork(neighborhood(selected),selected.level),layout=layoutNetwork(network,selected);
    assertGeometry(layout);
    const svg=renderNetworkSVG(layout,{lang:'en'});
    assert(svg.includes(new URLSearchParams({word:name,hanja:form}).toString().replaceAll('&','&amp;')));
    for(const part of parts)assert(svg.includes(`<tspan class="form-${part.hanja?'hanja':'hangul'}">${part.text}</tspan>`));
  }
  const word={level:'normal',word:'검은색',hanja:'<검은色',components:['色']};
  const svg=renderNetworkSVG(layoutNetwork({roots:['色'],characters:[{hanja:'色',readings:[]}],words:[word]},word));
  assert(svg.includes('&lt;검은'));
  assert(!svg.includes('><검은'));
});

test('repeated single-glyph words keep both connections after leaf placement',()=>{
  const selected=words.find(word=>word.hanja==='各各'),layout=layoutNetwork(neighborhood(selected),selected);
  assert.equal(layout.edges.find(edge=>edge.current).routes.length,2);
  assertGeometry(layout);
});
