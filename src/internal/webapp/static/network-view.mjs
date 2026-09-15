// Panning uses a canvas translation so even a fitted graph can be dragged.
// Leave wheel and touch scrolling to the page.
export function bindNetworkFocus(svg, layout) {
  const links=[...svg.querySelectorAll('[data-edge-id]')],nodes=[...svg.querySelectorAll('[data-node-glyph]')];
  let hovered=null,focused=null;
  const item=target=>target?.closest?.('[data-edge-id], [data-node-glyph]');
  function update() {
    const active=hovered??focused;
    const edges=active?layout.edges.filter(edge=>active.dataset.edgeId?edge.id===active.dataset.edgeId:edge.glyphs.includes(active.dataset.nodeGlyph)):[];
    const ids=new Set(edges.map(edge=>edge.id)),glyphs=new Set(edges.flatMap(edge=>edge.glyphs));
    if(active?.dataset.nodeGlyph)glyphs.add(active.dataset.nodeGlyph);
    svg.classList.toggle('has-focus',!!active);
    for(const link of links)link.classList.toggle('connection-focus',ids.has(link.dataset.edgeId));
    for(const node of nodes)node.classList.toggle('connection-focus',glyphs.has(node.dataset.nodeGlyph));
  }
  svg.addEventListener('pointerover',event=>{hovered=item(event.target);update();});
  svg.addEventListener('pointerout',event=>{hovered=svg.contains(event.relatedTarget)?item(event.relatedTarget):null;update();});
  svg.addEventListener('pointerleave',()=>{hovered=null;update();});
  svg.addEventListener('focusin',event=>{focused=item(event.target);update();});
  svg.addEventListener('focusout',event=>{focused=svg.contains(event.relatedTarget)?item(event.relatedTarget):null;update();});
}

export function bindNetworkDrag(viewport, {getPosition, onPan}) {
  let gesture = null;
  let suppressClick = false;

  function finish(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const id = gesture.id;
    gesture = null;
    viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  }

  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || event.pointerType === 'touch') return;
    suppressClick = false;
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, origin:{...getPosition()}, dragging:false};
  });
  viewport.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!(event.buttons & 1)) { finish(event); return; }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    // A small movement still counts as a normal node/word click.
    if (!gesture.dragging && Math.hypot(dx, dy) < 4) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      suppressClick = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
    }
    event.preventDefault();
    onPan({x:gesture.origin.x + dx, y:gesture.origin.y + dy});
  });
  viewport.addEventListener('pointerup', finish);
  viewport.addEventListener('pointercancel', finish);
  viewport.addEventListener('lostpointercapture', finish);
  viewport.addEventListener('pointerleave', event => {
    if (gesture && !gesture.dragging) finish(event);
  });
  viewport.addEventListener('dragstart', event => event.preventDefault());
  viewport.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const delta = {ArrowLeft:[40,0], ArrowRight:[-40,0], ArrowUp:[0,40], ArrowDown:[0,-40]}[event.key];
    if (!delta) return;
    event.preventDefault();
    const position = getPosition();
    onPan({x:position.x + delta[0], y:position.y + delta[1]});
  });
}
