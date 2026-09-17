import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutNetwork, filterNetwork} from '../static/network.mjs';
import {segmentHitsBox} from '../static/network-routing.mjs';

const word=(hanja,level='normal')=>({word:hanja,hanja,components:[...hanja],level});
const selected=word('甲乙');
const leaves=[...'丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥天地玄黃'];
const branches=leaves.map((glyph,i)=>word((i<12?'甲':'乙')+glyph,i%2?'normal':'classical'));
const network={
  roots:['甲','乙'],
  characters:[...'甲乙',...leaves].map(hanja=>({hanja,readings:[]})),
  words:[selected,...branches],
};

function assertGeometry(layout, source) {
  assert.equal(layout.edges.length,source.words.length,'keep every neighboring word');
  assert.deepEqual(layout.nodes.map(n=>n.hanja).sort(),source.characters.map(n=>n.hanja).sort());
  const items=[...layout.nodes,...layout.edges];
  for(const item of items) {
    assert(Number.isFinite(item.x)&&Number.isFinite(item.y));
    assert(item.x>=item.width/2&&item.x+item.width/2<=layout.width);
    assert(item.y>=item.height/2&&item.y+item.height/2<=layout.height);
  }
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++) {
    const a=items[i],b=items[j];
    assert(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.y-b.y)>=(a.height+b.height)/2,'labels must not overlap');
  }
  for(const edge of layout.edges)for(const route of edge.routes) {
    for(const item of items.filter(item=>item!==edge&&item.hanja!==route.glyph)) {
      const box={left:item.x-item.width/2,right:item.x+item.width/2,top:item.y-item.height/2,bottom:item.y+item.height/2};
      for(let i=1;i<route.points.length;i++)assert(!segmentHitsBox(route.points[i-1],route.points[i],box),'connections must avoid unrelated labels');
    }
  }
}

function assertBridge(layout) {
  const [left,right]=layout.nodes.filter(n=>n.root).sort((a,b)=>a.x-b.x);
  const center=layout.edges.find(e=>e.current);
  assert(center);
  assert(Math.abs(left.y-right.y)<1e-8);
  assert(Math.abs(center.y-left.y)<1e-8);
  assert(Math.abs(center.x-(left.x+right.x)/2)<1e-8,'selected word stays midway between its characters');
  assert(center.x-center.width/2-(left.x+left.width/2)>=240,'leave room on the left of the selected word');
  assert(right.x-right.width/2-(center.x+center.width/2)>=240,'leave room on the right of the selected word');
}

test('two-character words form broad lobes with a clear central bridge',()=>{
  const layout=layoutNetwork(network,selected),center=layout.edges.find(e=>e.current);
  assertBridge(layout);
  assertGeometry(layout,network);
  assert(layout.width>layout.height*1.5,'spread the neighborhood horizontally');
  for(const root of layout.nodes.filter(n=>n.root)) {
    const glyphs=branches.filter(w=>w.components.includes(root.hanja)).map(w=>w.components[1]);
    const neighbors=layout.nodes.filter(n=>glyphs.includes(n.hanja));
    assert(neighbors.some(n=>n.x<root.x-80)&&neighbors.some(n=>n.x>root.x+80),'surround each root rather than use a narrow half-circle');
    assert(neighbors.some(n=>n.y<root.y-100)&&neighbors.some(n=>n.y>root.y+100));
    assert(neighbors.every(n=>(n.x-center.x)*(root.x-center.x)>0),'keep each lobe on its side of the bridge');
  }
});

test('barbell layout retains shared characters, parallel words, and category filters',()=>{
  const source={...network,words:[...network.words,word('乙丙'),word('乙甲','classical')]};
  for(const category of ['all','normal','classical']) {
    const filtered=filterNetwork(source,category),layout=layoutNetwork(filtered,selected);
    assertGeometry(layout,filtered);
    if(category!=='classical')assertBridge(layout);
    else assert(!layout.edges.some(e=>e.current));
  }
  const empty=filterNetwork({...network,words:[selected]},'classical');
  assertGeometry(layoutNetwork(empty,selected),empty);
});

test('dense and mixed real words retain readable geometry in the barbell layout',()=>{
  const words=fs.readFileSync(new URL('../../../../dataset/word.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
  for(const name of ['감각','가격','학교','부모님']) {
    const current=words.find(w=>w.word===name),roots=[...new Set(current.components)];
    const connected=words.filter(w=>w.components.some(glyph=>roots.includes(glyph)));
    const characters=[...new Set(connected.flatMap(w=>w.components))].map(hanja=>({hanja,readings:[]}));
    const source={roots,words:connected,characters},layout=layoutNetwork(source,current);
    assertBridge(layout);
    assertGeometry(layout,source);
    assert(layout.width>layout.height,'dense neighborhoods should not become tall columns');
  }
});
