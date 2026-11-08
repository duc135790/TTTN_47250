import { productPricing } from './productPricing.js';

export const FINDER_PURPOSES = Object.freeze([
  { value: 'daily', label: 'Đi chơi, hằng ngày', categories: ['Sneaker', 'Sandal', 'Giày thể thao'] },
  { value: 'school', label: 'Đi học', categories: ['Sneaker', 'Giày thể thao'] },
  { value: 'office', label: 'Đi làm', categories: ['Giày da', 'Sneaker', 'Giày cao gót'] },
  { value: 'walking', label: 'Đi dạo', categories: ['Sneaker', 'Giày thể thao', 'Giày chạy bộ'] },
  { value: 'running', label: 'Chạy bộ', categories: ['Giày chạy bộ'] },
  { value: 'training', label: 'Tập luyện', categories: ['Giày thể thao'] },
  { value: 'occasion', label: 'Dự tiệc, sự kiện', categories: ['Giày da', 'Giày cao gót'] },
]);
export const FINDER_STYLES = Object.freeze([
  { value: 'any', label: 'Chưa có ưu tiên' }, { value: 'minimal', label: 'Tối giản, dễ phối' },
  { value: 'sporty', label: 'Thể thao, năng động' }, { value: 'street', label: 'Cá tính, đường phố' },
  { value: 'elegant', label: 'Thanh lịch' },
]);
export const finderError = message => Object.assign(new Error(message), { status: 400 });
export const finderColorKey = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi-VN');
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [null, Object.prototype].includes(Object.getPrototypeOf(value));
const sizeOf = value => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const size = Number(value);
  return Number.isFinite(size) && size >= 1 && size <= 60 && Number.isInteger(size * 2) ? size : null;
};
export const normalizeFinderPreferences = input => {
  if (!plain(input) || Object.keys(input).some(key => !['purpose', 'style', 'maxPrice', 'size', 'color'].includes(key))) throw finderError('Thông tin chọn giày không hợp lệ.');
  if (!FINDER_PURPOSES.some(item => item.value === input.purpose)) throw finderError('Hãy chọn mục đích sử dụng giày.');
  const style = input.style || 'any';
  if (!FINDER_STYLES.some(item => item.value === style)) throw finderError('Phong cách đã chọn không hợp lệ.');
  if (!['number', 'string'].includes(typeof input.maxPrice) || String(input.maxPrice).trim() === ''
    || !Number.isSafeInteger(Number(input.maxPrice)) || Number(input.maxPrice) <= 0) throw finderError('Ngân sách phải là số tiền nguyên lớn hơn 0.');
  const size = sizeOf(input.size);
  if (size === null) throw finderError('Size giày phải từ 1 đến 60, theo bước 0.5.');
  const color = input.color === undefined ? '' : input.color;
  if (typeof color !== 'string' || color.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(color)) throw finderError('Màu giày không hợp lệ.');
  return { purpose: input.purpose, style, maxPrice: Number(input.maxPrice), size, color: color.trim().normalize('NFC') };
};

export const normalizeRecommendationTags = input => {
  if (!plain(input) || Object.keys(input).some(key => !['purposes', 'styles'].includes(key))) throw finderError('Nhãn gợi ý sản phẩm không hợp lệ.');
  const normalize = (value, allowed, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > allowed.length || value.some(key => typeof key !== 'string' || !allowed.includes(key)) || new Set(value).size !== value.length) throw finderError(`${label} không hợp lệ hoặc bị trùng.`);
    return [...value];
  };
  return {
    purposes: normalize(input.purposes, FINDER_PURPOSES.map(item => item.value), 'Mục đích sử dụng'),
    styles: normalize(input.styles, FINDER_STYLES.filter(item => item.value !== 'any').map(item => item.value), 'Phong cách'),
  };
};

export const availableFinderSelections = product => {
  if (!product || product.isHidden || product.isArchived || !Number.isSafeInteger(product.countInStock) || product.countInStock <= 0) return [];
  if (Array.isArray(product.variants) && product.variants.length) return product.variants
    .filter(row => sizeOf(row.size) !== null && typeof row.color === 'string' && row.color.trim()
      && Number.isSafeInteger(row.quantity) && row.quantity > 0)
    .map(row => ({ size: Number(row.size), color: row.color, stock: row.quantity }));
  return (Array.isArray(product.sizes) ? product.sizes : []).filter(size => sizeOf(size) !== null)
    .map(size => ({ size: Number(size), color: product.color || '', stock: product.countInStock }));
};

export const finderCandidate = (product, preferences) => {
  const purpose = FINDER_PURPOSES.find(item => item.value === preferences.purpose);
  if (!purpose) return null;
  const selections = availableFinderSelections(product).filter(row => row.size === preferences.size
    && (!preferences.color || finderColorKey(row.color) === finderColorKey(preferences.color)));
  if (!selections.length) return null;
  let pricing;
  try { pricing = productPricing(product); } catch { return null; }
  if (pricing.salePrice > preferences.maxPrice) return null;
  const purposes = product.recommendation?.purposes || [];
  const explicitPurpose = purposes.includes(preferences.purpose);
  // A curated list is authoritative. Legacy products can use an openly described category match.
  if (purposes.length ? !explicitPurpose : !purpose.categories.includes(product.category)) return null;
  const styleMatch = preferences.style !== 'any' && (product.recommendation?.styles || []).includes(preferences.style);
  const selection = selections.sort((a, b) => b.stock - a.stock || finderColorKey(a.color).localeCompare(finderColorKey(b.color), 'vi'))[0];
  const reasons = [
    explicitPurpose ? `Cửa hàng gợi ý cho nhu cầu: ${purpose.label.toLocaleLowerCase('vi-VN')}` : `Gợi ý theo danh mục ${product.category}`,
    `Còn size ${selection.size}${selection.color ? ` · ${selection.color}` : ''}`,
    `Giá sau giảm trong ngân sách ${preferences.maxPrice.toLocaleString('vi-VN')}₫`,
    ...(styleMatch ? [`Phong cách: ${FINDER_STYLES.find(item => item.value === preferences.style).label.toLocaleLowerCase('vi-VN')}`] : []),
  ];
  // Neither popularity nor a larger discount can override stock, budget, or a curated purpose.
  return {
    product: {
      _id: String(product._id), name: product.name, image: product.image, brand: product.brand,
      category: product.category, material: product.material || '', origin: product.origin || '',
      style: product.style || '', rating: product.rating || 0, numReviews: product.numReviews || 0,
      ...pricing,
    },
    selection, reasons, purposeSource: explicitPurpose ? 'curated' : 'category', styleMatch,
  };
};
export const compareFinderCandidates = (a, b) => Number(b.styleMatch) - Number(a.styleMatch)
  || Number(b.purposeSource === 'curated') - Number(a.purposeSource === 'curated')
  || a.product.salePrice - b.product.salePrice || a.product._id.localeCompare(b.product._id);
export const retainFinderCandidate = (best, candidate) => {
  if (candidate && !best.some(item => item.product._id === candidate.product._id)) best.push(candidate);
  best.sort(compareFinderCandidates);
  if (best.length > 3) best.length = 3;
  return best;
};
export const recommendShoes = (products, input) => {
  const preferences = normalizeFinderPreferences(input), items = [];
  for (const product of products) retainFinderCandidate(items, finderCandidate(product, preferences));
  return { preferences, items };
};
