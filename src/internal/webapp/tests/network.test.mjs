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
  assert.equal(layout.nodes.length,10);
  assert.equal(layout.edges.length,9);
  assert.deepEqual(layout.nodes.filter(node=>node.root).map(node=>node.hanja),['感','覺']);
  assert.deepEqual(layout.edges.filter(edge=>edge.current).map(edge=>edge.word.hanja),['感覺']);
  assert(!layout.nodes.some(node=>node.hanja==='監'), 'do not expand the neighbors a second time');
  assert.deepEqual(layout,layoutNetwork(network,selected), 'layout must be deterministic');
});

test('long compounds, duplicate readings, homographs and repeated glyphs retain identity', () => {
  for(const hanja of ['勇敢無雙','降伏','各各','康健']) {
    const selected=words.find(word=>word.hanja===hanja), layout=layoutNetwork(neighborhood(selected),selected);
    assert.equal(new Set(layout.nodes.map(node=>node.hanja)).size,layout.nodes.length);
    const edge=layout.edges.find(edge=>edge.current);
    assert.deepEqual(edge.word.components,selected.components);
    if(hanja==='勇敢無雙')assert.equal(edge.glyphs.length,4);
    if(hanja==='降伏')assert.equal(layout.nodes.find(node=>node.hanja==='降').readings.length,2);
    if(hanja==='各各') {
      assert.deepEqual(edge.glyphs,['各']);
      const paths=edgePaths(edge,layout.nodes);
      assert.equal(paths.length,2);
      assert.notEqual(paths[0],paths[1], 'a repeated glyph needs a visible loop');
    }
    if(hanja==='康健')assert.equal(layout.edges.filter(edge=>edge.word.word==='강건').length,2);
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
