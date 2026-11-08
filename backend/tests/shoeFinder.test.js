import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import Product from '../models/productModel.js';
import { createApp } from '../app.js';
import { updateProduct } from '../controllers/productController.js';
import { availableFinderSelections, finderCandidate, normalizeFinderPreferences, normalizeRecommendationTags, recommendShoes } from '../../shared/shoeFinder.js';

const preferences = { purpose: 'school', style: 'minimal', size: 40, color: 'Trắng', maxPrice: 1000000 };
const shoe = (id = 1, extra = {}) => ({ _id: id.toString(16).padStart(24,'0'), name: `Shoe ${id}`, description: 'Test shoe', image: '/shoe.svg', brand: 'Test', category: 'Sneaker', price: 900000,
  countInStock: 5, variants: [{ color: 'Trắng', size: 40, quantity: 3 }, { color: 'Đen', size: 41, quantity: 2 }], sizes: [40,41], ...extra });

test('finder validates all preferences and rejects forged fields before reading products', () => {
  assert.deepEqual(normalizeFinderPreferences({ ...preferences, size: '40.5', maxPrice: '1000000', color: ' Trắng ' }), { ...preferences, size: 40.5 });
  for (const patch of [{ purpose: 'medical' }, { style: 'invented' }, { size: '' }, { size: 40.2 }, { maxPrice: 0 }, { maxPrice: '1e100' }, { color: [] }, { isPaid: true }]) assert.throws(() => normalizeFinderPreferences({ ...preferences, ...patch }), e => e.status === 400);
  assert.throws(() => normalizeFinderPreferences([]));
});
test('recommendations require colour, size and positive quantity in the same variant', () => {
  const wrong = shoe(1, { variants: [{ color: 'Trắng', size: 41, quantity: 3 }, { color: 'Đen', size: 40, quantity: 2 }] });
  const soldOut = shoe(2, { variants: [{ color: 'Trắng', size: 40, quantity: 0 }, { color: 'Đen', size: 40, quantity: 5 }] });
  assert.equal(recommendShoes([wrong, soldOut], preferences).items.length, 0);
  const result = recommendShoes([shoe()], preferences).items[0];
  assert.deepEqual(result.selection, { color: 'Trắng', size: 40, stock: 3 });
});
test('budget uses the shared discounted price, including integer VND rounding', () => {
  const result = recommendShoes([shoe(1, { price: 1200000, discountPercent: 25 }), shoe(2, { price: 1000001 })], preferences);
  assert.equal(result.items.length, 1); assert.equal(result.items[0].product.salePrice, 900000);
  assert.equal(recommendShoes([shoe(3, { price: 999999, discountPercent: 15 })], { ...preferences, maxPrice: 849999 }).items[0].product.salePrice, 849999);
});
test('hidden, archived, unavailable and invalid-price products never become recommendations', () => {
  const bad = [shoe(1, { isHidden: true }), shoe(2, { isArchived: true }), shoe(3, { countInStock: 0 }), shoe(4, { price: -1 }), shoe(5, { discountPercent: 101 })];
  assert.equal(recommendShoes(bad, preferences).items.length, 0);
});
test('curated purposes override category fallback; old products remain useful and reasons are truthful', () => {
  const excluded = shoe(1, { recommendation: { purposes: ['occasion'], styles: ['minimal'] } });
  const legacy = shoe(2, { variants: [], sizes: [40], color: 'Trắng' });
  const result = recommendShoes([excluded, legacy], preferences);
  assert.deepEqual(result.items.map(item => item.product._id), [legacy._id]);
  assert.equal(result.items[0].purposeSource, 'category');assert.match(result.items[0].reasons[0], /danh mục/);
  assert(!result.items[0].reasons.some(reason => /êm|độ vừa|phong cách/i.test(reason)));
  assert.equal(recommendShoes([shoe()], { ...preferences, purpose: 'running' }).items.length, 0);
});
test('ranking is deterministic, returns at most three and cannot ignore hard constraints for style', () => {
  const rows = [shoe(1), shoe(2, { recommendation: { purposes: ['school'], styles: [] } }), shoe(3, { recommendation: { purposes: ['school'], styles: ['minimal'] } }), shoe(4, { recommendation: { styles: ['minimal'] } })];
  const a = recommendShoes(rows, preferences), b = recommendShoes([...rows].reverse(), preferences);
  assert.equal(a.items.length, 3);assert.deepEqual(a, b);assert.equal(a.items[0].product._id, rows[2]._id);
  assert.equal(recommendShoes([shoe(5, { price: 2000000, recommendation: { purposes: ['school'], styles: ['minimal'] } })], preferences).items.length, 0);
});
test('public recommendation DTO omits reservation tokens and internal product fields', () => {
  const row = shoe(1, { checkoutReservations: ['private'], deliveryReturnReceipts: ['private'], metaKeywords: 'internal' });
  const snapshot = structuredClone(row);const candidate = finderCandidate(row, preferences);
  assert.deepEqual(row, snapshot);assert.equal(candidate.product.checkoutReservations, undefined);assert.equal(candidate.product.deliveryReturnReceipts, undefined);assert.equal(candidate.product.metaKeywords, undefined);
  assert.equal(availableFinderSelections(shoe(1,{variants:[], sizes:[],color:'Trắng'})).length,0);
});
test('recommendation metadata is optional for old shoes and validated at input and schema levels', async () => {
  assert.deepEqual(normalizeRecommendationTags({}), { purposes: [], styles: [] });
  for (const input of [{ purposes: ['school','school'] }, { styles:['any'] }, { purposes:['unknown'] }, { styles:'minimal' }, { isAdmin:true }]) assert.throws(() => normalizeRecommendationTags(input));
  await new Product(shoe()).validate();
  await new Product(shoe(2, { recommendation: { purposes: ['school'], styles: ['minimal'] } })).validate();
  await assert.rejects(new Product(shoe(2, { recommendation: { purposes: ['medical'] } })).validate());
  await assert.rejects(new Product(shoe(2, { recommendation: { styles: ['minimal','minimal'] } })).validate());
});
test('editing recommendation labels does not migrate legacy inventory or change product price', async t => {
  const product = new Product(shoe(1, { variants: [], sizes: [40], color: 'Trắng', countInStock: 3 }));product.__v=2;
  t.mock.method(Product, 'findById', async () => product);let saved=0;t.mock.method(product,'save',async()=>{saved++;return product;});
  const res={json(value){return value;}};
  await updateProduct({params:{id:String(product._id)},body:{version:2,recommendation:{purposes:['school'],styles:['minimal']}}},res);
  assert.equal(saved,1);assert.equal(product.price,900000);assert.equal(product.countInStock,3);assert.equal(product.variants.length,0);assert.deepEqual(product.recommendation.purposes.toObject(),['school']);
});

let server, baseUrl, originalReady;
before(async()=>{originalReady=Object.getOwnPropertyDescriptor(mongoose.connection,'readyState');Object.defineProperty(mongoose.connection,'readyState',{configurable:true,get:()=>1});server=createServer(createApp());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(originalReady)Object.defineProperty(mongoose.connection,'readyState',originalReady);else delete mongoose.connection.readyState;});
const mockProducts=(t,rows)=>t.mock.method(Product,'find',filter=>{const query={select(){return query;},lean(){return query;},cursor:async function*(){yield* rows;}};return query;});
test('public finder routes are reachable before /:id and only read product data', async t=>{
  mockProducts(t,[shoe(),shoe(2,{isHidden:true})]);t.mock.method(Product,'updateOne',()=>assert.fail('Finder must not write'));
  const response=await fetch(baseUrl+'/api/products/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(preferences)});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.items.length,1);assert.equal(body.items[0].selection.color,'Trắng');assert.equal(response.headers.get('cache-control'),'no-store');
  const options=await fetch(baseUrl+'/api/products/recommendation-options');assert.equal(options.status,200);assert.deepEqual((await options.json()).sizes,[40,41]);
});
test('malformed finder requests are rejected before product queries',async t=>{
  t.mock.method(Product,'find',()=>assert.fail('No query for malformed preference'));
  const response=await fetch(baseUrl+'/api/products/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...preferences,maxPrice:-1})});assert.equal(response.status,400);
});
