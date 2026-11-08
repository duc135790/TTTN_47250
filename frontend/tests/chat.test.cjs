const { before, afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { randomUUID } = require('node:crypto');
let useChatThread, ChatThread, ChatWidget, helpers;
const nativeTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
const plugin = { name: 'chat-fixtures', setup(build) {
  build.onResolve({ filter: /^react(?:\/jsx-runtime)?$|^react-router-dom$|^react-icons\/fa$|context\/AuthContext|utils\/api|^\.\.\/hooks\/useChatThread$|\.css$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => {
    if (name === 'react') return { contents: 'export const useState=v=>globalThis.__chatUI.state(v);export const useRef=v=>globalThis.__chatUI.ref(v);export const useEffect=(fn,deps)=>globalThis.__chatUI.effect(fn,deps);' };
    if (name === 'react/jsx-runtime') return { contents: 'export const Fragment="fragment";export const jsx=(type,props,key)=>({type,props:props||{},key});export const jsxs=jsx;' };
    if (name === 'react-router-dom') return { contents: 'export const Link="a";export const useLocation=()=>({pathname:"/products/123456789012345678901234",search:""});' };
    if (name === 'react-icons/fa') return { contents: 'export const FaComments=()=>null;export const FaTimes=()=>null;' };
    if (name.includes('AuthContext')) return { contents: 'export const useAuth=()=>globalThis.__chatUI.auth;' };
    if (name.includes('utils/api')) return { contents: 'export const chatAPI=new Proxy({},{get:(_,name)=>(...args)=>globalThis.__chatUI.request(name,args)});export const staffAPI=chatAPI;' };
    if (name.includes('hooks/useChatThread')) return { contents: 'export default ()=>globalThis.__chatUI.thread;' };
    return { contents: '' };
  });
} };
const load = async file => {
  const output = await esbuild.build({ entryPoints: [path.join(__dirname, '..', 'src', file)], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [plugin], logLevel: 'silent' });
  const module = { exports: {} };new Function('module', 'exports', output.outputFiles[0].text)(module, module.exports);return module.exports;
};
before(async () => {
  ({ default: useChatThread } = await load('hooks/useChatThread.js'));
  ({ default: ChatThread } = await load('components/ChatThread.jsx'));
  ({ default: ChatWidget } = await load('components/ChatWidget.jsx'));
  helpers = await load('utils/chat.js');
});
afterEach(() => { globalThis.__chatUI?.unmount(); Object.assign(globalThis, nativeTimers); });
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const customer = { _id: 'buyer-a', name: 'Buyer', isAdmin: false };
const conversation = (seq = 1) => ({ _id: 'chat-a', state: 'open', revision: 0, lastSeq: seq, readSeq: seq, otherReadSeq: 0, unread: false });
const message = (seq, side = 'customer') => ({ seq, text: 'Message ' + seq, side, createdAt: '2026-10-31T00:00:00Z', senderName: 'Name' });
const setup = (render = () => useChatThread(globalThis.__chatUI.args), initial = {}) => {
  const h = { hooks: [], cursor: 0, pending: [], requests: [], timers: new Map(), auth: { user: customer, loading: false }, args: { customer: true, enabled: true }, mounted: true, writesAfterUnmount: 0, thread: {}, ...initial,
    state(value) { const index = this.cursor++;if (!this.hooks[index]) this.hooks[index] = { type: 'state', value: typeof value === 'function' ? value() : value }; const slot = this.hooks[index];return [slot.value, next => { if (!this.mounted) this.writesAfterUnmount++;slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    ref(value) { const index = this.cursor++;if (!this.hooks[index]) this.hooks[index] = { type: 'ref', value: { current: value } };return this.hooks[index].value; },
    effect(fn, deps) { const index = this.cursor++, old = this.hooks[index]; if (!old) this.hooks[index] = { type: 'effect', deps, fn };if (!old || !same(old.deps, deps)) { const slot = this.hooks[index];this.pending.push(() => { slot.cleanup?.();slot.deps = deps;slot.fn = fn;slot.cleanup = fn(); }); } },
    request(name, args) { let resolve, reject;const promise = new Promise((yes, no) => { resolve = yes;reject = no; });this.requests.push({ name, args, resolve: data => resolve({ data }), reject });return promise; },
    calls(name) { return this.requests.filter(item => item.name === name); },
    value() { this.cursor = 0;const result = render();this.pending.splice(0).forEach(effect => effect());return result; },
    unmount() { if (!this.mounted) return;this.hooks.filter(slot => slot.type === 'effect').forEach(slot => slot.cleanup?.());this.mounted = false; },
  };
  globalThis.__chatUI = h;
  const storage = new Map([['user', JSON.stringify(h.auth.user)], ['token', 'token-a']]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
  const events = new EventTarget();
  globalThis.window = { crypto: { randomUUID }, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.setInterval = callback => { const id = randomUUID();h.timers.set(id, callback);return id; };
  globalThis.clearInterval = id => h.timers.delete(id);
  h.value();return h;
};
const ready = async h => {
  h.calls('mine').at(-1).resolve(conversation());await settle();h.calls('messages').at(-1).resolve({ conversation: conversation(), messages: [message(1)], hasMore: false });await settle();return h.value();
};
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const text = value => value == null || typeof value === 'boolean' ? '' : Array.isArray(value) ? value.map(text).join(' ') : typeof value === 'object' ? text(value.props?.children) : String(value);

test('message merging preserves chronological history and removes polling/send duplicates', () => {
  assert.deepEqual(helpers.mergeChatMessages([message(3), message(1)], [message(2), message(3)]).map(row => row.seq), [1, 2, 3]);
  assert.equal(helpers.isChatCustomer(customer), true); assert.equal(helpers.isChatCustomer({ ...customer, accountType: 'staff' }), false);
  assert.equal(helpers.canReplyChat({ ...customer, accountType: 'staff' }, { state: 'open', assignedTo: { id: customer._id, accountType: 'customer' } }), false);
});

test('a successful send never advances polling over a reply that arrived before the send', async () => {
  const h = setup();await ready(h);
  const sending = h.value().send('My new message');h.calls('send')[0].resolve({ conversation: conversation(3), message: message(3) });assert.equal(await sending, true);
  [...h.timers.values()][0]();h.calls('mine').at(-1).resolve(conversation(3));await settle();
  assert.equal(h.calls('messages').at(-1).args[1].after, 1);
  h.calls('messages').at(-1).resolve({ conversation: conversation(3), messages: [message(2, 'store'), message(3)], hasMore: false });await settle();
  assert.deepEqual(h.value().messages.map(row => row.seq), [1, 2, 3]);
});

test('double submission is blocked and an uncertain network failure reuses the same client ID on retry', async () => {
  const h = setup();h.calls('mine')[0].resolve(null);await settle();
  const first = h.value().send('Need size 40');assert.equal(await h.value().send('Need size 40'), false);assert.equal(h.calls('send').length, 1);
  h.calls('send')[0].reject(new Error('Connection interrupted'));assert.equal(await first, false);assert(h.value().sendError);
  const second = h.value().send('Need size 40');assert.equal(h.calls('send')[1].args[1].clientId, h.calls('send')[0].args[1].clientId);
  h.calls('send')[1].resolve({ conversation: conversation(), message: message(1) });assert.equal(await second, true);
  assert.equal(h.value().messages.length, 1);
});

test('retry after a temporary history failure clears the error even when the customer has no conversation yet', async () => {
  const h = setup();h.calls('mine')[0].reject(new Error('Temporary outage'));await settle();assert(h.value().loadError);
  h.value().reload();h.calls('mine').at(-1).resolve(null);await settle();
  assert.equal(h.value().loadError, '');assert.equal(h.value().conversation, null);assert.equal(h.value().loading, false);
});

test('closing during a pending send unlocks the composer and reopening restores server history', async () => {
  const h = setup();await ready(h);const pending = h.value().send('New message');
  h.args = { ...h.args, enabled: false };h.value();
  h.calls('send')[0].resolve({ conversation: conversation(2), message: message(2) });assert.equal(await pending, false);assert.equal(h.value().sending, false);
  h.args = { ...h.args, enabled: true };h.value();h.calls('mine').at(-1).resolve(conversation(2));await settle();
  h.calls('messages').at(-1).resolve({ conversation: conversation(2), messages: [message(2)], hasMore: false });await settle();
  assert.deepEqual(h.value().messages.map(row => row.seq), [1, 2]);
});

test('late history or send responses cannot restore messages after switching accounts or unmounting', async () => {
  const h = setup();const stale = h.calls('mine')[0];
  h.auth.user = { _id: 'buyer-b', isAdmin: false };localStorage.setItem('user', JSON.stringify(h.auth.user));localStorage.setItem('token', 'token-b');h.value();
  stale.resolve({ ...conversation(), customerName: 'Old customer' });await settle();assert.equal(h.calls('messages').length, 0);
  h.calls('mine').at(-1).resolve(null);await settle();const pending = h.value().send('Account B message');h.unmount();
  h.calls('send')[0].resolve({ conversation: conversation(), message: message(1) });assert.equal(await pending, false);assert.equal(h.writesAfterUnmount, 0);
});

test('a revoked conversation hides its existing history instead of leaving another customer visible', async () => {
  const h = setup();await ready(h);[...h.timers.values()][0]();h.calls('mine').at(-1).resolve(conversation());await settle();
  h.calls('messages').at(-1).reject({ response: { status: 403, data: { message: 'Reassigned' } } });await settle();
  assert.equal(h.value().unavailable, true);assert.equal(h.value().messages.length, 0);assert.equal(await h.value().send('No access'), false);
});

test('a read-only advisor composer preserves plain text and cannot submit', async () => {
  const calls = [];
  const thread = { conversation: conversation(), messages: [message(1)], send: async (...args) => { calls.push(args);return false; }, reload() {} };
  const h = setup(() => ChatThread({ thread, canReply: false }), { args: {}, thread });
  h.hooks[0].value = '<script>alert(1)</script>';
  let tree = h.value();const form = nodes(tree).find(node => node.type === 'form');await form.props.onSubmit({ preventDefault() {} });assert.equal(calls.length, 0);
  assert.equal(nodes(tree).find(node => node.type === 'textarea').props.disabled, true);
  assert(!nodes(tree).some(node => node.props.dangerouslySetInnerHTML));assert(text(tree).includes('Bạn chưa phụ trách cuộc tư vấn này'));
});

test('selecting a recommendation fills a draft and product ID without sending until the advisor confirms', async () => {
  const calls = [], thread = { conversation: conversation(), messages: [], send: async (...args) => { calls.push(args); return true; }, reload() {} };
  const h = setup(() => ChatThread({ thread, canReply: true }), { args: {}, thread });
  let tree = h.value(); nodes(tree).find(node => node.type === 'button' && text(node) === 'Chọn giày để gợi ý').props.onClick();
  tree = h.value(); const picker = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'ProductSuggestionPicker'); assert(picker);
  picker.props.onChoose({ _id: 'shoe-choice', name: 'Sneaker City' }); tree = h.value();
  assert.equal(calls.length, 0); assert(nodes(tree).find(node => node.type === 'textarea').props.value.includes('Sneaker City'));
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Chọn giày để gợi ý').props.onClick();
  nodes(h.value()).find(node => typeof node.type === 'function' && node.type.name === 'ProductSuggestionPicker').props.onChoose({ _id: 'shoe-next', name: 'Running Everyday' });
  tree = h.value(); assert(nodes(tree).find(node => node.type === 'textarea').props.value.includes('Running Everyday')); assert(!nodes(tree).find(node => node.type === 'textarea').props.value.includes('Sneaker City'));
  await nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.equal(calls[0][1], 'shoe-next'); assert.equal(nodes(h.value()).find(node => node.type === 'textarea').props.value, '');
});

test('finder handoff fills a customer draft and sends only after the customer submits', async () => {
  const calls = [], handled = [], handoff = { id: 'finder-1', text: 'Mình cần giày đi học, size 40.', productId: '123456789012345678901234', productName: 'City Shoe' };
  const thread = { conversation: null, messages: [], send: async (...args) => { calls.push(args); return true; }, reload() {} };
  const h = setup(() => ChatThread({ thread, customer: true, consultationDraft: handoff, onConsultationHandled: id => handled.push(id) }));
  let tree = h.value(); assert.equal(calls.length, 0); assert.equal(nodes(tree).find(n => n.type === 'textarea').props.value, handoff.text);
  assert.deepEqual(handled, ['finder-1']); h.value(); assert.deepEqual(handled, ['finder-1']);
  await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [[handoff.text, handoff.productId]]); assert.equal(nodes(h.value()).find(n => n.type === 'textarea').props.value, '');
});

test('finder handoff preserves existing customer text until explicitly appended', () => {
  let handoff = null; const handled = [], thread = { conversation: null, messages: [], reload() {} };
  const h = setup(() => ChatThread({ thread, customer: true, consultationDraft: handoff, onConsultationHandled: id => handled.push(id) }));
  nodes(h.value()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'Mình thích màu trắng.' } });
  handoff = { id: 'finder-2', text: 'Size 40, ngân sách 1 triệu.' }; h.value(); let tree = h.value();
  assert.equal(nodes(tree).find(n => n.type === 'textarea').props.value, 'Mình thích màu trắng.'); assert.deepEqual(handled, []);
  nodes(tree).find(n => n.type === 'button' && text(n) === 'Thêm vào tin đang soạn').props.onClick(); tree = h.value();
  assert.equal(nodes(tree).find(n => n.type === 'textarea').props.value, 'Mình thích màu trắng.\n\nSize 40, ngân sách 1 triệu.'); assert.deepEqual(handled, ['finder-2']);
});

test('an oversized finder append leaves the customer draft and attachment unchanged', () => {
  let handoff = null; const thread = { conversation: null, messages: [], reload() {} };
  const h = setup(() => ChatThread({ thread, customer: true, consultationDraft: handoff }));
  nodes(h.value()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'a'.repeat(1950) } });
  handoff = { id: 'finder-3', text: 'b'.repeat(100), productId: '123456789012345678901234' }; h.value();
  nodes(h.value()).find(n => n.type === 'button' && text(n) === 'Thêm vào tin đang soạn').props.onClick();
  assert.equal(nodes(h.value()).find(n => n.type === 'textarea').props.value.length, 1950);
  assert(nodes(h.value()).some(n => n.props?.role === 'alert')); assert.equal(h.hooks[1].value, undefined);
});

test('new messages remain unread while reading older history until the reader reaches the latest messages', async () => {
  const h = setup();await ready(h);h.value().setReadVisible(false);
  [...h.timers.values()][0]();h.calls('mine').at(-1).resolve(conversation(2));await settle();
  h.calls('messages').at(-1).resolve({ conversation: { ...conversation(2), readSeq: 1, unread: true }, messages: [message(2, 'store')], hasMore: false });await settle();
  assert.equal(h.calls('read').length, 0);
  h.value().setReadVisible(true);h.value().reload();h.calls('mine').at(-1).resolve(conversation(2));await settle();
  h.calls('messages').at(-1).resolve({ conversation: { ...conversation(2), readSeq: 1, unread: true }, messages: [], hasMore: false });await settle();
  assert.equal(h.calls('read').at(-1).args[1], 2);h.calls('read').at(-1).resolve({ readSeq: 2 });await settle();
  assert.equal(h.value().conversation.unread, false);
});

test('floating customer widget is absent for staff/admin and guests receive a sign-in prompt with the required label', () => {
  const h = setup(() => ChatWidget(), { auth: { user: { ...customer, accountType: 'staff' }, loading: false } });assert.equal(h.value(), null);
  h.auth.user = { ...customer, isAdmin: true };assert.equal(h.value(), null);
  h.auth.user = null;const wrapper = h.value();assert.equal(typeof wrapper.type, 'function');
  h.hooks = [];h.cursor = 0;h.thread = { conversation: null };let tree = wrapper.type({ user: null });assert(text(tree).includes('Nhân viên tư vấn'));
  h.hooks[0].value = true;h.cursor = 0;tree = wrapper.type({ user: null });assert(text(tree).includes('Đăng nhập để nhắn tin'));
});

test('finder event opens the customer widget with an unsent draft and rejects malformed handoffs', () => {
  const thread = { conversation: null, messages: [], reload() {} };
  const h = setup(() => { const wrapper = ChatWidget(); return wrapper.type({ user: hUser() }); }, { thread });
  function hUser() { return globalThis.__chatUI.auth.user; }
  const event = value => Object.assign(new Event('shoe-store:finder-consultation'), { detail: value });
  window.dispatchEvent(event({ text: 'Invalid', productId: 'not-a-product' })); assert(!nodes(h.value()).some(n => n.props?.role === 'dialog'));
  window.dispatchEvent(event({ text: 'Mình cần giày đi học, size 40.', productId: '123456789012345678901234', productName: 'City Shoe' }));
  const tree = h.value(); assert(nodes(tree).some(n => n.props?.role === 'dialog'));
  const child = nodes(tree).find(n => n.type?.name === 'ChatThread'); assert.equal(child.props.consultationDraft.text, 'Mình cần giày đi học, size 40.');
  assert.equal(h.calls('send').length, 0);
});
