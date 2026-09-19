import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {componentNetwork,filterNetwork,layoutNetwork,renderNetworkSVG} from '../static/network.mjs';

const words=readFileSync(new URL('../../../../dataset/word.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const neighborhood=roots=>{
  const related=words.filter(word=>word.components.some(glyph=>roots.includes(glyph)));
  return {roots,words:related,characters:[...new Set([...roots,...related.flatMap(word=>word.components)])].map(hanja=>({hanja,readings:[]}))};
};

test('price components produce separate one-root graphs with only directly related words',()=>{
  const source=neighborhood(['價','格']),before=JSON.stringify(source);
  for(const glyph of ['價','格']) {
    const network=componentNetwork(source,glyph);
    assert.deepEqual(network.roots,[glyph]);
    assert.deepEqual(network.characters.map(c=>c.hanja),[glyph]);
    assert.deepEqual(network.words,words.filter(word=>word.components.includes(glyph)));
    const layout=layoutNetwork(network,words.find(word=>word.hanja==='價格'));
    assert.deepEqual(layout.nodes.map(node=>node.hanja),[glyph]);
    assert.equal(layout.edges.filter(edge=>edge.current).length,1);
    for(const edge of layout.edges) {
      assert.deepEqual(edge.glyphs,[glyph]);
      assert.equal(edge.routes.length,1);
      assert.equal(edge.routes[0].points.length,2);
    }
  }
  assert.equal(JSON.stringify(source),before);
});

test('single-root filters keep the root and full mixed, repeated and homonymous word identities',()=>{
  for(const glyph of ['色','父','各','分','生']) {
    const source=neighborhood([glyph]),network=componentNetwork(source,glyph);
    for(const level of ['all','easy','normal','hard','classical']) {
      const filtered=filterNetwork(network,level),layout=layoutNetwork(filtered);
      assert.deepEqual(layout.nodes.map(node=>node.hanja),[glyph]);
      assert.deepEqual(layout.edges.map(edge=>edge.word),source.words.filter(word=>level==='all'||word.level===level));
      const particles=[...layout.nodes,...layout.edges];
      for(const p of particles)for(const key of ['x','y','width','height'])assert(Number.isFinite(p[key]),`${glyph}: ${key}`);
      for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++) {
        const a=particles[i],b=particles[j];
        assert(Math.abs(a.x-b.x)>=(a.width+b.width)/2+12 || Math.abs(a.y-b.y)>=(a.height+b.height)/2+12,`${glyph}: labels overlap`);
      }
    }
  }
  const mixed=layoutNetwork(componentNetwork(neighborhood(['色']),'色'));
  const svg=renderNetworkSVG(mixed);
  assert.match(svg,/class="form-hangul">검은<\/tspan>/);
  assert.match(svg,/class="form-hanja">色<\/tspan>/);
  assert.equal((svg.match(/class="network-character /g)||[]).length,1);
  const repeated=layoutNetwork(componentNetwork(neighborhood(['各']),'各')).edges.find(edge=>edge.word.word==='각각');
  assert.deepEqual(repeated.word.components,['各','各']);
  assert.equal(repeated.routes.length,1);
});

test('empty or missing component neighborhoods stay finite without inventing characters',()=>{
  const rootOnly=componentNetwork({roots:['價'],characters:[{hanja:'價',readings:[]}],words:[]},'價');
  assert.equal(layoutNetwork(rootOnly).nodes.length,1);
  assert.equal(layoutNetwork(rootOnly).edges.length,0);
  const missing=componentNetwork(neighborhood(['價']),'不存在');
  assert.deepEqual(missing.words,[]);
  assert.deepEqual(layoutNetwork(missing),{nodes:[],edges:[],width:320,height:240});
});
