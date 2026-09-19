import {wordKey, WORD_LEVELS, wordCategory} from './learning.mjs';
import {routeNetwork, roundedPath} from './network-routing.mjs';

// Keep the written Korean portions of a mixed word visible without inventing
// character nodes for them. Adjacent portions share one typographic treatment.
export function wordFormParts(word) {
  const glyphs=new Set(word.components), parts=[];
  for(const text of word.hanja) {
    const hanja=glyphs.has(text), previous=parts.at(-1);
    if(previous?.hanja===hanja)previous.text+=text;
    else parts.push({text,hanja});
  }
  return parts;
}
export const isMixedWord=word=>word.components.length>0 && /[가-힣]/u.test(word.hanja);

// Preserve root characters for context, but prune unrelated leaves and words.
export function filterNetwork(network, level='all') {
  if (!WORD_LEVELS.includes(level)) throw new RangeError('Invalid word category');
  if (level==='all') return network;
  const words=network.words.filter(word=>word.level===level);
  const glyphs=new Set([...network.roots,...words.flatMap(word=>word.components)]);
  return {...network, words, characters:network.characters.filter(character=>glyphs.has(character.hanja))};
}

// Words are edge labels (junctions for compounds with 3+ characters), not
// additional character nodes. Keep glyph identity separate from its readings.
export function layoutNetwork(network, selected) {
  const roots = new Set(network.roots);
  const rootList = [...roots];
  const nodes = network.characters.map(character => ({
    ...character, id:character.hanja, root:roots.has(character.hanja), width:80, height:80,
  }));
  const byGlyph = new Map(nodes.map(node => [node.hanja,node]));
  const edges = network.words.map(word => ({
    word, id:wordKey(word), glyphs:[...new Set(word.components)],
    current:selected ? wordKey(word)===wordKey(selected) : false,
    width:Math.max(92, Math.max([...word.word].length,[...word.hanja].length)*15+26), height:60,
  }));
  const angle = index => rootList.length===2 ? Math.PI+index*Math.PI : -Math.PI/2+index*2*Math.PI/rootList.length;
  const barbell=rootList.length===2;
  const groups = rootList.map(() => []);
  for (const node of nodes.filter(node=>!node.root)) {
    const touching=edges.filter(edge=>edge.glyphs.includes(node.hanja));
    const owner=rootList.findIndex(root=>touching.some(edge=>edge.glyphs.includes(root)));
    groups[Math.max(0,owner)]?.push(node);
  }
  // Visit companions in the same compound together instead of scattering them
  // according to dataset order around the ring.
  groups.forEach(group=>{
    const pending=new Set(group),ordered=[];
    const visit=node=>{
      if(!pending.delete(node))return;
      ordered.push(node);
      for(const edge of edges.filter(e=>e.glyphs.includes(node.hanja)))for(const glyph of edge.glyphs) {
        const next=byGlyph.get(glyph);if(pending.has(next))visit(next);
      }
    };
    for(const node of group)visit(node);
    group.splice(0,group.length,...ordered);
  });
  // Leave a clear bridge for the selected word, with a broad elliptical lobe
  // around each root. Larger neighborhoods need more room on both sides.
  const radii=groups.map(group=>270+Math.max(0,group.length-5)*(barbell?6:16));
  const bridge=barbell?Math.max(360,Math.max(...radii)*1.25*Math.SQRT1_2+140):0;
  rootList.forEach((glyph,index)=>{
    const radius=rootList.length===1?0:barbell?bridge:210;
    Object.assign(byGlyph.get(glyph),{x:Math.cos(angle(index))*radius,y:Math.sin(angle(index))*radius,fixed:true});
  });
  groups.forEach((group,index) => group.forEach((node,i) => {
    const root=byGlyph.get(rootList[index]);
    const spread=rootList.length===1 ? 2*Math.PI : barbell ? Math.PI*1.5 : Math.PI*0.85;
    const theta=angle(index)+(group.length===1 ? 0 : (i/(group.length-(rootList.length===1 ? 0 : 1))-0.5)*spread);
    const radius=radii[index];
    Object.assign(node,{x:root.x+Math.cos(theta)*radius*(barbell?1.25:1),y:root.y+Math.sin(theta)*radius*(barbell?0.8:1)});
  }));
  edges.forEach(edge => {
    const ends=edge.glyphs.map(glyph=>byGlyph.get(glyph));
    edge.x=ends.reduce((sum,node)=>sum+node.x,0)/ends.length;
    edge.y=ends.reduce((sum,node)=>sum+node.y,0)/ends.length;
    edge.fixed=edge.current;
  });
  const parallel=new Map();
  for(const edge of edges) {
    const key=JSON.stringify([...edge.glyphs].sort());
    if(!parallel.has(key))parallel.set(key,[]);
    parallel.get(key).push(edge);
  }
  // A one-character word is a leaf at its character, including mixed words
  // such as 검은色. Its position depends only on siblings at that character,
  // never on its index among all words (which created long dangling branches).
  for(const group of parallel.values())if(group[0].glyphs.length===1) {
    const node=byGlyph.get(group[0].glyphs[0]);
    const ordered=[...group].sort((a,b)=>Number(b.current)-Number(a.current));
    const radius=Math.max(155,ordered.reduce((sum,edge)=>sum+edge.width+28,0)/(2*Math.PI));
    const start=angle(Math.max(0,rootList.indexOf(node.hanja)));
    ordered.forEach((edge,index)=>{
      const theta=start+index*2*Math.PI/ordered.length;
      edge.x=node.x+Math.cos(theta)*radius;
      edge.y=node.y+Math.sin(theta)*radius;
    });
  }
  for(const group of parallel.values())if(group.length>1&&group[0].glyphs.length===2) {
    group.sort((a,b)=>Number(b.current)-Number(a.current));
    const [a,b]=group[0].glyphs.map(g=>byGlyph.get(g)),length=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
    group.forEach((edge,i)=>{
      const lane=group[0].current?(i===0?0:Math.ceil(i/2)*(i%2?1:-1)):i-(group.length-1)/2;
      edge.x-=(b.y-a.y)/length*lane*84;edge.y+=(b.x-a.x)/length*lane*84;
    });
  }
  const particles=[...nodes,...edges];
  particles.forEach(p=>{p.homeX=p.x;p.homeY=p.y;});
  // Preserve the lobe spacing during relaxation instead of pulling every
  // connection back to the same short length.
  const links=edges.flatMap(edge=>edge.glyphs.map(glyph=>{
    const node=byGlyph.get(glyph);
    return [edge,node,barbell?Math.max(135,Math.hypot(edge.x-node.x,edge.y-node.y)):135];
  }));
  for(let iteration=0;iteration<240;iteration++) {
    particles.forEach(p=>{p.fx=(p.homeX-p.x)*0.014;p.fy=(p.homeY-p.y)*0.014;});
    for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++) {
      const a=particles[i], b=particles[j];
      const dx=b.x-a.x || 0.1, dy=b.y-a.y || 0.1;
      const distance=Math.max(1,Math.hypot(dx,dy));
      const force=2200/(distance*distance);
      const fx=dx/distance*force, fy=dy/distance*force;
      a.fx-=fx;b.fx+=fx;a.fy-=fy;b.fy+=fy;
      const overlapX=(a.width+b.width)/2+22-Math.abs(dx);
      const overlapY=(a.height+b.height)/2+22-Math.abs(dy);
      if(overlapX>0 && overlapY>0) {
        if(overlapX<overlapY) {const push=Math.sign(dx)*overlapX*0.65;a.fx-=push;b.fx+=push;}
        else {const push=Math.sign(dy)*overlapY*0.65;a.fy-=push;b.fy+=push;}
      }
    }
    for(const [a,b,length] of links) {
      const dx=b.x-a.x, dy=b.y-a.y, distance=Math.max(1,Math.hypot(dx,dy));
      const force=(distance-length)*0.045;
      a.fx+=dx/distance*force;a.fy+=dy/distance*force;
      b.fx-=dx/distance*force;b.fy-=dy/distance*force;
    }
    const step=0.9-iteration/360;
    for(const p of particles) if(!p.fixed) {p.x+=Math.max(-16,Math.min(16,p.fx))*step;p.y+=Math.max(-16,Math.min(16,p.fy))*step;}
  }
  // Remove residual label overlaps without dropping nodes or truncating words.
  for(let pass=0;pass<100;pass++) {
    let moved=false;
    for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++) {
      const a=particles[i], b=particles[j];
      if(a.fixed&&b.fixed) continue;
      const dx=b.x-a.x || 0.1, dy=b.y-a.y || 0.1;
      const ox=(a.width+b.width)/2+12-Math.abs(dx), oy=(a.height+b.height)/2+12-Math.abs(dy);
      if(ox<=0||oy<=0) continue;
      const axis=ox<oy?'x':'y', push=Math.sign(axis==='x'?dx:dy)*(Math.min(ox,oy)+0.2);
      if(!a.fixed)a[axis]-=push*(b.fixed?1:0.5);
      if(!b.fixed)b[axis]+=push*(a.fixed?1:0.5);
      moved=true;
    }
    if(!moved)break;
  }
  // A label can oscillate in a gap narrower than itself between fixed items.
  // Settle any remaining collisions vertically, preserving all fixed anchors.
  const settled=particles.filter(p=>p.fixed);
  for(const p of particles.filter(p=>!p.fixed)) {
    const blockers=settled.filter(other=>Math.abs(p.x-other.x)<(p.width+other.width)/2+12);
    const clear=y=>blockers.every(other=>Math.abs(y-other.y)>=(p.height+other.height)/2+12);
    if(!clear(p.y)) {
      const candidates=blockers.flatMap(other=>{
        const offset=(p.height+other.height)/2+12.2;
        return [other.y-offset,other.y+offset];
      });
      candidates.sort((a,b)=>Math.abs(a-p.y)-Math.abs(b-p.y)||a-b);
      p.y=candidates.find(clear);
    }
    settled.push(p);
  }
  routeNetwork(nodes,edges);
  const routePoints=edges.flatMap(e=>e.routes.flatMap(r=>r.points));
  const minX=Math.min(0,...particles.map(p=>p.x-p.width/2),...routePoints.map(p=>p.x))-55;
  const minY=Math.min(0,...particles.map(p=>p.y-p.height/2),...routePoints.map(p=>p.y))-65;
  const width=Math.max(320,Math.max(0,...particles.map(p=>p.x+p.width/2),...routePoints.map(p=>p.x))-minX+55);
  const height=Math.max(240,Math.max(0,...particles.map(p=>p.y+p.height/2),...routePoints.map(p=>p.y))-minY+65);
  particles.forEach(p=>{p.x-=minX;p.y-=minY;});
  // Each route owns its points; shared obstacles are never translated here.
  const shifted=new Set();
  routePoints.forEach(p=>{if(!shifted.has(p)){p.x-=minX;p.y-=minY;shifted.add(p);}});
  return {nodes,edges,width,height};
}

export function edgePaths(edge, nodes) {
  if(edge.routes)return edge.routes.map(route=>roundedPath(route.points));
  const byGlyph=new Map(nodes.map(node=>[node.hanja,node]));
  return edge.glyphs.flatMap(glyph=>{
    const node=byGlyph.get(glyph);
    if(edge.word.components.filter(part=>part===glyph).length>1) {
      const dx=edge.x-node.x, dy=edge.y-node.y, distance=Math.max(1,Math.hypot(dx,dy));
      return [-1,1].map(side=>`M ${node.x} ${node.y} Q ${(node.x+edge.x)/2-dy/distance*65*side} ${(node.y+edge.y)/2+dx/distance*65*side} ${edge.x} ${edge.y}`);
    }
    return [`M ${node.x} ${node.y} L ${edge.x} ${edge.y}`];
  });
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

export function renderNetworkSVG(layout, {lang='ko',highlighted,wordLabel='단어 살펴보기',characterLabel='한자',label='한자와 단어 연결 그래프'} = {}) {
  const wordHref=word=>`#explore?${new URLSearchParams({word:word.word,hanja:word.hanja})}`;
  const characterHref=glyph=>`#explore?${new URLSearchParams({character:glyph})}`;
  const category=wordCategory;
  const categoryNames=lang==='ko'?{easy:'기초',normal:'일반',hard:'심화',classical:'고전·문어'}:{easy:'Easy',normal:'General',hard:'Advanced',classical:'Classical'};
  const categoryLabel=word=>categoryNames[category(word)];
  const paths=layout.edges.map(edge=>`<a href="${esc(wordHref(edge.word))}" tabindex="-1" aria-hidden="true" data-edge-id="${esc(edge.id)}" class="network-line-link ${category(edge.word)} ${edge.current?'current':''}">${edgePaths(edge,layout.nodes).map(path=>`<path class="network-path-halo" d="${path}"/><path class="network-hit" d="${path}"/><path class="network-path" d="${path}"/>`).join('')}</a>`).join('');
  const labels=layout.edges.map(edge=>`<a class="network-edge ${category(edge.word)} ${edge.current?'current':''}" href="${esc(wordHref(edge.word))}" data-edge-id="${esc(edge.id)}" data-edge-word="${esc(edge.word.hanja)}" aria-label="${esc(wordLabel)}: ${esc(edge.word.word)} (${esc(edge.word.hanja)}), ${categoryLabel(edge.word)}" ${edge.current?'aria-current="true"':''} transform="translate(${edge.x} ${edge.y})"><title>${esc(edge.word.word)} · ${esc(edge.word.hanja)} · ${categoryLabel(edge.word)} — ${esc(edge.word[lang==='ko'?'meaning_ko':'meaning_en'])}</title><rect x="${-edge.width/2}" y="${-edge.height/2}" width="${edge.width}" height="${edge.height}" rx="7"/><text class="edge-word" y="-11">${esc(edge.word.word)}</text><text class="edge-hanja" y="6">${isMixedWord(edge.word)?wordFormParts(edge.word).map(part=>`<tspan class="form-${part.hanja?'hanja':'hangul'}">${esc(part.text)}</tspan>`).join(''):esc(edge.word.hanja)}</text><text class="edge-category" y="23">${categoryLabel(edge.word)}</text></a>`).join('');
  const nodes=layout.nodes.map(node=>{
    const sounds=[...new Set(node.readings.map(reading=>reading.sound_ko))].join(' / ');
    const meanings=node.readings.map(reading=>reading[lang==='ko'?'meaning_ko':'meaning_en'].join(', ')).join(' / ');
    return `<a class="network-character ${node.root?'root':''} ${node.hanja===highlighted?'highlighted':''}" href="${esc(characterHref(node.hanja))}" data-node-glyph="${esc(node.hanja)}" aria-label="${characterLabel}: ${esc(node.hanja)} [${esc(sounds)}], ${esc(meanings)}" transform="translate(${node.x} ${node.y})"><title>${esc(node.hanja)} [${esc(sounds)}] — ${esc(meanings)}</title><circle r="38"/><text class="node-hanja" y="-1">${esc(node.hanja)}</text><text class="node-sound" y="22">${esc(sounds)}</text></a>`;
  }).join('');
  return `<svg viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-label="${esc(label)}">${paths}${labels}${nodes}</svg>`;
}
