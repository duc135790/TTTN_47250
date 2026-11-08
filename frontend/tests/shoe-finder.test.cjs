const { before, afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { randomUUID } = require('node:crypto');
let component, helpers;
const plugin = { name: 'finder-fixtures', setup(build) {
  build.onResolve({ filter: /^react(?:\/jsx-runtime)?$|^react-router-dom$|^react-icons\/fa$|context\/AuthContext|utils\/api|\.css$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => {
    if (name === 'react') return { contents: 'export const useState=v=>globalThis.__finder.state(v);export const useRef=v=>globalThis.__finder.ref(v);export const useEffect=(fn,deps)=>globalThis.__finder.effect(fn,deps);' };
    if (name === 'react/jsx-runtime') return { contents: 'export const Fragment="fragment";export const jsx=(type,props,key)=>({type,props:props||{},key});export const jsxs=jsx;' };
    if (name === 'react-router-dom') return { contents: 'export const Link="a";export const useLocation=()=>({pathname:"/shoe-finder",search:globalThis.__finder.search?"?"+globalThis.__finder.search:""});export const useNavigate=()=> (...args)=>globalThis.__finder.navigation.push(args);export const useSearchParams=()=>[new URLSearchParams(globalThis.__finder.search),p=>{globalThis.__finder.search=new URLSearchParams(p).toString()}];' };
    if (name === 'react-icons/fa') return { contents: ['FaArrowLeft','FaArrowRight','FaCheck','FaComments','FaShoePrints','FaSlidersH'].map(key => `export const ${key}=()=>null;`).join('') };
    if (name.includes('AuthContext')) return { contents: 'export const useAuth=()=>globalThis.__finder.auth;' };
    if (name.includes('utils/api')) return { contents: 'export const productsAPI=new Proxy({},{get:(_,name)=>(...args)=>globalThis.__finder.request(name,args)});export const cartAPI=productsAPI;' };
    return { contents: '' };
  });
} };
const load = async file => {
  const output = await esbuild.build({ entryPoints: [path.join(__dirname, '..', 'src', file)], bundle:true, write:false, platform:'node', format:'cjs', jsx:'automatic', define:{'import.meta.env':'{}'}, plugins:[plugin], logLevel:'silent' });
  const module = {exports:{}};new Function('module','exports',output.outputFiles[0].text)(module,module.exports);return module.exports;
};
before(async () => { component = await load('pages/ShoeFinder.jsx'); helpers = await load('utils/shoeFinder.js'); });
afterEach(() => globalThis.__finder?.unmount());
const settle = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
const same = (a,b) => a && b && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]));
const prefs = {purpose:'school',style:'minimal',maxPrice:1000000,size:40,color:'Trắng'};
const buyer = {_id:'buyer-a',name:'Buyer',isAdmin:false};
const resultItem = (id=1) => ({product:{_id:String(id).padStart(24,'0'),name:`Shoe ${id}`,image:'/shoe.svg',brand:'Test',category:'Sneaker',salePrice:900000,originalPrice:1000000,discountPercent:10},selection:{size:40,color:'Trắng',stock:2},reasons:['Còn đúng màu và size']});
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree,...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const setup = (render=()=>component.default(), initial={}) => {
  const h = {hooks:[],cursor:0,pending:[],search:'',requests:[],navigation:[],events:[],auth:{user:buyer,loading:false},mounted:true,writesAfterUnmount:0,...initial,
    state(value){const i=this.cursor++;if(!this.hooks[i])this.hooks[i]={type:'state',value:typeof value==='function'?value():value};const slot=this.hooks[i];return[slot.value,next=>{if(!this.mounted)this.writesAfterUnmount++;slot.value=typeof next==='function'?next(slot.value):next;}];},
    ref(value){const i=this.cursor++;if(!this.hooks[i])this.hooks[i]={type:'ref',value:{current:value}};return this.hooks[i].value;},
    effect(fn,deps){const i=this.cursor++,old=this.hooks[i];if(!old)this.hooks[i]={type:'effect'};if(!old || !same(old.deps,deps))this.pending.push(()=>{const slot=this.hooks[i];slot.cleanup?.();slot.deps=deps;slot.cleanup=fn();});},
    request(name,args){let resolve,reject;const p=new Promise((yes,no)=>{resolve=yes;reject=no;});this.requests.push({name,args,resolve:data=>resolve({data}),reject});return p;},
    calls(name){return this.requests.filter(call=>call.name===name);},
    value(){this.cursor=0;const tree=render();this.pending.splice(0).forEach(fn=>fn());return tree;},
    button(label){const node=nodes(this.value()).find(n=>n.type==='button'&&text(n).trim()===label);assert(node,`Missing button: ${label}`);return node;},
    change(name,value){const node=nodes(this.value()).find(n=>['input','select'].includes(n.type)&&n.props.name===name&&(n.props.type!=='radio'||n.props.value===value));assert(node);node.props.onChange({target:{value}});},
    submit(){const form=nodes(this.value()).find(n=>n.type==='form');assert(form);form.props.onSubmit({preventDefault(){}});},
    unmount(){if(!this.mounted)return;this.hooks.filter(s=>s.type==='effect').forEach(s=>s.cleanup?.());this.mounted=false;},
  };
  globalThis.__finder=h;
  const storage=new Map([['user',JSON.stringify(h.auth.user)],['token','token-a']]);
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
  globalThis.window={crypto:{randomUUID},dispatchEvent:event=>h.events.push(event),CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail;}}};
  h.value();return h;
};

test('finder URL roundtrip preserves choices, rejects duplicate parameters and creates an unsent consultation draft',()=>{
  setup();assert.deepEqual(helpers.finderPreferencesFromSearch(helpers.finderSearch(prefs)),prefs);
  assert.throws(()=>helpers.finderPreferencesFromSearch(helpers.finderSearch(prefs)+'&size=41'));
  assert.throws(()=>helpers.finderPreferencesFromSearch(helpers.finderSearch(prefs)+'&token=bad'));
  const draft=helpers.finderConsultationDraft(prefs,resultItem());
  assert(draft.text.includes('1.000.000'));assert(draft.text.includes('40'));assert.equal(draft.productId,resultItem().product._id);
  assert(helpers.normalizeFinderHandoff(draft).id);assert.equal(helpers.normalizeFinderHandoff({...draft,productId:'invalid'}),null);
});

test('five real quiz steps validate choices and submit normalized preferences only at the end',async()=>{
  const h=setup();h.submit();assert(text(h.value()).includes('Hãy chọn nhu cầu'));
  h.change('purpose','school');h.submit();h.change('style','minimal');h.submit();
  h.change('maxPrice','0');h.submit();assert(text(h.value()).includes('lớn hơn 0'));
  h.change('maxPrice','1000000');h.submit();h.change('size','40.2');h.submit();assert(text(h.value()).includes('bước 0.5'));
  h.change('size','40');h.submit();assert.equal(h.calls('recommendShoes').length,0);
  h.change('color','Trắng');h.submit();h.value();
  assert.deepEqual(h.calls('recommendShoes')[0].args[0],prefs);
  h.calls('recommendShoes')[0].resolve({items:[resultItem(1),resultItem(2),resultItem(3)]});await settle();
  assert.equal(nodes(h.value()).filter(n=>n.type===component.FinderResultCard).length,3);
  h.button('So sánh 3 đôi đã chọn').props.onClick();assert(nodes(h.value()).some(n=>n.type===component.FinderComparison));
});

test('changing preferences aborts old requests and late responses cannot replace new results',async()=>{
  const h=setup(undefined,{search:helpers.finderSearch(prefs)});const first=h.calls('recommendShoes')[0];
  h.search=helpers.finderSearch({...prefs,maxPrice:2000000});h.value();assert(first.args[1].signal.aborted);
  const second=h.calls('recommendShoes')[1];second.resolve({items:[resultItem(2)]});await settle();
  first.resolve({items:[resultItem(1)]});await settle();
  assert.equal(nodes(h.value()).find(n=>n.type===component.FinderResultCard).props.item.product.name,'Shoe 2');
  h.unmount();assert(second.args[1].signal.aborted);assert.equal(h.writesAfterUnmount,0);
});

test('empty or unavailable results keep hard preferences and offer retry or consultation',async()=>{
  const h=setup(undefined,{search:helpers.finderSearch(prefs)});
  h.calls('recommendShoes')[0].reject({response:{data:{message:'Kho tạm thời chưa sẵn sàng'}}});await settle();
  assert(text(h.value()).includes('Kho tạm thời chưa sẵn sàng'));h.button('Thử lại').props.onClick();h.value();
  assert.deepEqual(h.calls('recommendShoes')[1].args[0],prefs);
  h.calls('recommendShoes')[1].resolve({items:[]});await settle();assert(text(h.value()).includes('Chưa có đôi giày khớp'));
  h.button('Nhờ nhân viên hỗ trợ').props.onClick();assert.equal(h.events.length,1);assert.equal(h.events[0].type,helpers.FINDER_CHAT_EVENT);
  assert(h.events[0].detail.text.includes('40'));assert.equal(h.calls('send').length,0);
});

test('card adds exactly one suggested colour and size, pins session and blocks repeated clicks',async()=>{
  const item=resultItem();const h=setup(()=>component.FinderResultCard({item,checked:true,onCompare(){},onConsult(){},returnTo:'/shoe-finder?x'}));
  const click=h.button('Thêm vào giỏ').props.onClick;const pending=click();await click();assert.equal(h.calls('addToCart').length,1);
  const call=h.calls('addToCart')[0];assert.deepEqual(call.args.slice(0,4),[item.product._id,1,40,'Trắng']);assert.equal(call.args[4].token,'token-a');
  call.resolve({});await pending;assert(text(h.value()).includes('Đã thêm 1 đôi'));
});

test('cart inventory rejection is visible and a switched account ignores the previous success',async()=>{
  const item=resultItem();const h=setup(()=>component.FinderResultCard({item,checked:true,onCompare(){},onConsult(){},returnTo:'/shoe-finder'}));
  const first=h.button('Thêm vào giỏ').props.onClick();h.calls('addToCart')[0].reject({response:{data:{message:'Size này đã hết hàng'}}});await first;
  assert(text(h.value()).includes('Size này đã hết hàng'));
  const second=h.button('Thêm vào giỏ').props.onClick();localStorage.setItem('token','token-b');localStorage.setItem('user',JSON.stringify({_id:'buyer-b'}));
  h.calls('addToCart')[1].resolve({});await second;assert(!text(h.value()).includes('Đã thêm 1 đôi'));
});

test('guest returns to the same finder choices after login and staff cannot add to customer cart',()=>{
  const item=resultItem(),returnTo='/shoe-finder?'+helpers.finderSearch(prefs);
  const h=setup(()=>component.FinderResultCard({item,checked:true,onCompare(){},onConsult(){},returnTo}),{auth:{user:null,loading:false}});
  h.button('Đăng nhập để thêm giỏ').props.onClick();assert.deepEqual(h.navigation[0],['/login',{state:{from:returnTo}}]);assert.equal(h.calls('addToCart').length,0);
  h.auth.user={_id:'staff-a',accountType:'staff'};assert(!nodes(h.value()).some(n=>n.type==='button'&&text(n)==='Thêm vào giỏ'));assert(text(h.value()).includes('Mở kho tư vấn'));
});
