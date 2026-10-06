import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.split('<script type="module">')[1].split('</script>')[0];
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    style: {}, classList: { remove() {} }, textContent: '',
    setAttribute() {}, addEventListener() {}, disabled: false,
  });
  return elements.get(id);
}
const controls = [element('firmness'), element('nudge'), element('pause')];
const context = vm.createContext({
  console: { error() {} }, navigator: {}, window: { isSecureContext: true },
  matchMedia: () => ({ matches: true }),
  document: {
    getElementById: element,
    querySelectorAll: selector => selector === '.preset' ? [] : controls,
    addEventListener() {},
  },
});
vm.runInContext(script, context);
// Flush the rejection handler from asynchronous WebGPU initialization.
await new Promise(resolve => setImmediate(resolve));
assert.equal(element('fallback').style.display, 'flex');
assert.match(element('fallback-detail').textContent, /WebGPU is not available/);
assert.equal(element('status-text').textContent, 'WEBGPU · UNAVAILABLE');
assert(controls.every(control => control.disabled));
assert.equal(context.window.citrusDiagnostics().paused, true);
assert.equal(context.window.citrusDiagnostics().ready, false);

element('fallback').style = {};
element('fallback-detail').textContent = '';
const insecure = vm.createContext({ ...context, window: { isSecureContext: false } });
vm.runInContext(script, insecure);
await new Promise(resolve => setImmediate(resolve));
assert.match(element('fallback-detail').textContent, /network address uses HTTP/);
assert.equal(insecure.window.citrusDiagnostics().ready, false);
console.log('Passed: unsupported WebGPU, HTTP network diagnostics, and reduced-motion initial state.');
