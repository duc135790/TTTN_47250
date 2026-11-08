// Runs the production build in an isolated Chrome profile. All API traffic is mocked;
// no real account, cart, conversation, payment or database is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '../../..'), dist = path.join(root, 'frontend/dist');
  const artifacts = path.join(root, 'frontend/tests/.artifacts/shoe-finder');
  fs.mkdirSync(artifacts, { recursive: true });
  const { recommendShoes } = await import(pathToFileURL(path.join(root, 'shared/shoeFinder.js')));
  const products = [1, 2, 3].map((i) => ({ _id: String(i).padStart(24, '0'), name: ['Sneaker City Trắng', 'Daily Court', 'Everyday Classic'][i - 1], description: 'Giày mẫu kiểm thử', image: '/shoe.svg', brand: ['Nike', 'Adidas', 'Puma'][i - 1], category: 'Sneaker', material: 'Da tổng hợp', style: 'Tối giản', price: 1000000 + i * 100000, discountPercent: 20, countInStock: 7, variants: [{ color: 'Trắng', size: 40, quantity: 5 }, { color: 'Đen', size: 41, quantity: 2 }], recommendation: { purposes: ['school', 'daily'], styles: ['minimal'] } }));
  // Three matches within the same discounted budget.
  products[2].price = 1200000;
  const profile = { _id: '123456789012345678901234', name: 'Khách kiểm thử', email: 'fixture@example.test', isAdmin: false };
  const requests = [], errors = []; let conversation = null, messages = [];
  const apiReply = (url, method, postData) => {
    const route = new URL(url).pathname.replace(/^.*?\/api/, '');
    const body = postData ? JSON.parse(postData) : null; requests.push({ route, method, body });
    if (route === '/customers/profile') return profile;
    if (route === '/products/recommendation-options') return { sizes: [40, 41], colors: ['Trắng', 'Đen'] };
    if (route === '/products/recommendations') return recommendShoes(products, body);
    if (route === '/customers/cart') return [];
    if (route === '/chats/mine') return conversation;
    if (route === '/chats/mine/messages') {
      conversation = { _id: 'fixture-chat', state: 'open', lastSeq: 1, readSeq: 1, otherReadSeq: 0 };
      const message = { seq: 1, text: body.text, side: 'customer', senderName: profile.name, createdAt: new Date().toISOString() }; messages = [message];
      return { conversation, message };
    }
    if (route.endsWith('/messages')) return { conversation, messages, hasMore: false };
    if (route.endsWith('/read')) return { readSeq: 1 };
    throw new Error(`Unexpected fixture API: ${method} ${route}`);
  };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const filename = path.resolve(dist, '.' + decodeURIComponent(pathname));
    if (!filename.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    const file = fs.existsSync(filename) && fs.statSync(filename).isFile() ? filename : path.join(dist, 'index.html');
    const mime = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(artifacts, 'profile-' + randomUUID())}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws, send;
  try {
    const browserUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
      chrome.stderr.on('data', chunk => { const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      chrome.on('error', reject);
    });
    const debuggerOrigin = browserUrl.replace(/^ws:/, 'http:').split('/devtools/')[0];
    const targets = await (await fetch(debuggerOrigin + '/json/list')).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let seq = 0; const pending = new Map();
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 12000);
      pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener('message', async event => {
      const packet = JSON.parse(event.data);
      if (packet.id) { const task = pending.get(packet.id); if (!task) return; pending.delete(packet.id); clearTimeout(task.timer); packet.error ? task.reject(new Error(packet.error.message)) : task.resolve(packet.result); }
      if (packet.method === 'Runtime.exceptionThrown') errors.push(packet.params.exceptionDetails.exception?.description || packet.params.exceptionDetails.text);
      if (packet.method === 'Fetch.requestPaused') {
        const { requestId, request } = packet.params;
        try {
          const data = apiReply(request.url, request.method, request.postData);
          await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(data)).toString('base64') });
        } catch (error) { errors.push(error.message); await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); }
      }
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 80)); }
      throw new Error('Waiting failed: ' + expression + '\n' + await evaluate('document.body.innerText.slice(-1800)'));
    };
    const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
    const input = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
    const submit = async () => { await click('.finder-quiz button[type="submit"]'); };
    const screenshot = async name => {
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(image.data, 'base64'));
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('token','fixture-token');localStorage.setItem('user',${JSON.stringify(JSON.stringify(profile))});` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: origin + '/shoe-finder' });
    await wait('!!document.querySelector("input[name=purpose]")'); await screenshot('desktop-quiz');
    await click('input[name=purpose][value=school]'); await submit();
    await wait('!!document.querySelector("input[name=style]")'); await click('input[name=style][value=minimal]'); await submit();
    await wait('!!document.querySelector("input[name=maxPrice]")'); await input('input[name=maxPrice]', '1000000'); await submit();
    await wait('!!document.querySelector("input[name=size]")'); await input('input[name=size]', '40'); await submit();
    await wait('!!document.querySelector("select[name=color]")'); await evaluate('(()=>{const el=document.querySelector("select[name=color]");el.value="Trắng";el.dispatchEvent(new Event("change",{bubbles:true}));})()'); await submit();
    await wait('document.querySelectorAll(".finder-card").length===3');
    assert.equal(await evaluate('document.querySelectorAll(".finder-selection").length'), 3);
    assert(await evaluate('[...document.querySelectorAll(".finder-selection")].every(el=>el.textContent.includes("40")&&el.textContent.includes("Trắng"))'));
    await click('.finder-card .finder-button--primary'); await wait('!!document.querySelector(".finder-notice--success")');
    assert.deepEqual(requests.find(r => r.route === '/customers/cart' && r.method === 'POST').body, { productId: products[0]._id, quantity: 1, size: 40, color: 'Trắng' });
    await click('.finder-results-toolbar .finder-button--primary'); await wait('!!document.querySelector(".finder-comparison table")'); await screenshot('desktop-results');
    await click('.finder-card__actions button:nth-child(2)'); await wait('!!document.querySelector(".consult-panel textarea") && document.querySelector(".consult-panel textarea").value.includes("Sneaker City")');
    assert.equal(requests.filter(r => r.route === '/chats/mine/messages').length, 0);
    await evaluate('(()=>{const el=document.querySelector(".consult-panel textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,"Mình thích màu trắng.");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await click('.finder-card:nth-child(2) .finder-card__actions button:nth-child(2)');
    await wait('document.querySelector(".consult-context")?.textContent.includes("Nhu cầu chọn giày")');
    assert.equal(await evaluate('document.querySelector(".consult-panel textarea").value'), 'Mình thích màu trắng.');
    await click('.consult-context button');
    await wait('document.querySelector(".consult-panel textarea").value.includes("Daily Court")');
    assert.equal(requests.filter(r => r.route === '/chats/mine/messages').length, 0); await screenshot('consultation-draft');
    await click('.consult-compose button[type=submit]'); await wait('document.querySelectorAll(".consult-message").length===1');
    const sent = requests.find(r => r.route === '/chats/mine/messages'); assert.equal(sent.body.productId, products[1]._id); assert(sent.body.text.startsWith('Mình thích màu trắng.'));
    await click('button[aria-label="Đóng khung tư vấn"]');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('window.scrollTo(0,0)'); await wait('document.querySelectorAll(".finder-card").length===3');
    assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile page overflows'); await screenshot('mobile-results');
    await click('.finder-results-heading button'); await wait('!!document.querySelector("input[name=purpose]")'); await screenshot('mobile-quiz');
    assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile quiz overflows');
    assert.deepEqual(errors, []);
    const report = { date: new Date().toISOString(), result: 'passed', viewports: ['1440x1000', '390x844'], checks: ['5-step quiz', 'three in-stock exact variants', 'discount budget', 'comparison', 'existing cart payload', 'unsent chat handoff', 'preserve existing draft', 'manual chat send', 'mobile overflow'], apiMode: 'fixtures only', screenshots: ['desktop-quiz.png', 'desktop-results.png', 'consultation-draft.png', 'mobile-results.png', 'mobile-quiz.png'] };
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally {
    if (send && ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} }
    ws?.close(); if (chrome.exitCode === null) chrome.kill(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
