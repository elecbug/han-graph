import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNetworkDrag} from '../static/network-view.mjs';

function setup() {
  const viewport = new EventTarget(), classes = new Set(), captured = new Set();
  viewport.classList = {add:name=>classes.add(name), remove:name=>classes.delete(name)};
  viewport.setPointerCapture = id=>captured.add(id);
  viewport.hasPointerCapture = id=>captured.has(id);
  viewport.releasePointerCapture = id=>captured.delete(id);
  let position = {x:10, y:20};
  bindNetworkDrag(viewport, {getPosition:()=>position, onPan:value=>position=value});
  const fire = (type, properties={}) => {
    const event = new Event(type, {cancelable:true});
    Object.assign(event, {pointerId:1, pointerType:'mouse', isPrimary:true, button:0, buttons:1, clientX:100, clientY:100, detail:1}, properties);
    viewport.dispatchEvent(event);
    return event;
  };
  return {fire, classes, captured, position:()=>position};
}

test('drag translates in both directions, captures the pointer and suppresses the release click', () => {
  const graph = setup();
  assert.equal(graph.fire('pointerdown').defaultPrevented, false);
  assert.equal(graph.fire('pointermove', {clientX:130, clientY:80}).defaultPrevented, true);
  assert.deepEqual(graph.position(), {x:40, y:0});
  assert(graph.classes.has('is-dragging'));
  assert(graph.captured.has(1));
  graph.fire('pointermove', {clientX:60, clientY:140});
  assert.deepEqual(graph.position(), {x:-30, y:60});
  graph.fire('pointerup', {buttons:0});
  assert.equal(graph.classes.size, 0);
  assert.equal(graph.captured.size, 0);
  assert.equal(graph.fire('click').defaultPrevented, true);
  graph.fire('pointerdown');
  graph.fire('pointerup', {buttons:0});
  assert.equal(graph.fire('click').defaultPrevented, false, 'the next ordinary link click must navigate');
});

test('slight hand movement preserves node/edge clicks; keyboard activation is never blocked', () => {
  const graph = setup();
  graph.fire('pointerdown');
  graph.fire('pointermove', {clientX:102, clientY:101});
  graph.fire('pointerup', {buttons:0});
  assert.deepEqual(graph.position(), {x:10, y:20});
  assert.equal(graph.fire('click').defaultPrevented, false);
  graph.fire('pointerdown');
  graph.fire('pointermove', {clientX:125});
  graph.fire('pointerup', {buttons:0});
  assert.equal(graph.fire('click', {detail:0}).defaultPrevented, false);
});

test('wheel, touch swipes and secondary buttons retain browser scrolling and default actions', () => {
  const graph = setup();
  for (const properties of [{pointerType:'touch'}, {button:2, buttons:2}, {isPrimary:false}]) {
    assert.equal(graph.fire('pointerdown', properties).defaultPrevented, false);
    assert.equal(graph.fire('pointermove', {...properties, clientY:180}).defaultPrevented, false);
    graph.fire('pointerup', properties);
  }
  for (const deltaY of [200,-200]) assert.equal(graph.fire('wheel', {deltaY}).defaultPrevented, false);
  assert.deepEqual(graph.position(), {x:10, y:20});
  assert.equal(graph.captured.size, 0);
});

test('cancellation, capture loss and released buttons end dragging without further movement', () => {
  for (const end of ['pointercancel','lostpointercapture','pointermove']) {
    const graph = setup();
    graph.fire('pointerdown');
    graph.fire('pointermove', {clientX:120});
    graph.fire(end, {buttons:0});
    graph.fire('pointermove', {clientX:170});
    assert.deepEqual(graph.position(), {x:30, y:20});
    assert.equal(graph.classes.size, 0);
    assert.equal(graph.captured.size, 0);
  }
});

test('arrow keys pan a focused graph and modified shortcuts keep their default action', () => {
  const graph = setup();
  assert.equal(graph.fire('keydown', {key:'ArrowRight'}).defaultPrevented, true);
  assert.equal(graph.fire('keydown', {key:'ArrowUp'}).defaultPrevented, true);
  assert.deepEqual(graph.position(), {x:-30, y:60});
  assert.equal(graph.fire('keydown', {key:'ArrowDown', ctrlKey:true}).defaultPrevented, false);
  assert.equal(graph.fire('keydown', {key:'PageDown'}).defaultPrevented, false);
});
