import { FINDER_PURPOSES, FINDER_STYLES, normalizeFinderPreferences } from '../../../shared/shoeFinder';

export { FINDER_PURPOSES, FINDER_STYLES, normalizeFinderPreferences };
export const FINDER_CHAT_EVENT = 'shoe-store:finder-consultation';
export const emptyFinderAnswers = () => ({ purpose: '', style: 'any', maxPrice: '2000000', size: '', color: '' });
export const finderSearch = preferences => new URLSearchParams({
  purpose: preferences.purpose, style: preferences.style, maxPrice: String(preferences.maxPrice),
  size: String(preferences.size), ...(preferences.color ? { color: preferences.color } : {}),
}).toString();
export const finderPreferencesFromSearch = search => {
  const params = new URLSearchParams(search);
  if (![...params.keys()].length) return null;
  if ([...params.keys()].some(key => !['purpose', 'style', 'maxPrice', 'size', 'color'].includes(key))
    || [...params.keys()].some(key => params.getAll(key).length !== 1)) throw new Error('Thông tin chọn giày trong đường dẫn không hợp lệ.');
  return normalizeFinderPreferences(Object.fromEntries(params));
};
export const finderStepError = (step, answers) => {
  if (step === 0 && !FINDER_PURPOSES.some(item => item.value === answers.purpose)) return 'Hãy chọn nhu cầu chính của bạn.';
  if (step === 1 && !FINDER_STYLES.some(item => item.value === answers.style)) return 'Hãy chọn một phong cách.';
  if (step === 2 && (!String(answers.maxPrice).trim() || !Number.isSafeInteger(Number(answers.maxPrice)) || Number(answers.maxPrice) <= 0)) return 'Nhập ngân sách là số tiền nguyên lớn hơn 0.';
  if (step === 3 && (!String(answers.size).trim() || !Number.isFinite(Number(answers.size)) || Number(answers.size) < 1 || Number(answers.size) > 60 || !Number.isInteger(Number(answers.size) * 2))) return 'Nhập size từ 1 đến 60, theo bước 0.5.';
  return '';
};
export const finderConsultationDraft = (preferences, candidate) => {
  const p = normalizeFinderPreferences(preferences);
  const purpose = FINDER_PURPOSES.find(item => item.value === p.purpose).label;
  const style = FINDER_STYLES.find(item => item.value === p.style).label;
  return {
    text: `Mình muốn được tư vấn chọn giày.\nNhu cầu: ${purpose}.\nPhong cách: ${style}.\nNgân sách tối đa: ${p.maxPrice.toLocaleString('vi-VN')}đ.\nSize đang tìm: ${p.size}.\nMàu: ${p.color || 'Chưa có ưu tiên'}.${candidate ? `\nMình đang cân nhắc ${candidate.product.name}, màu ${candidate.selection.color || 'theo sản phẩm'}, size ${candidate.selection.size}.` : ''}`,
    ...(candidate ? { productId: candidate.product._id, productName: candidate.product.name } : {}),
  };
};
export const normalizeFinderHandoff = value => {
  if (!value || typeof value !== 'object' || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 1800) return null;
  if (value.productId !== undefined && !/^[a-f0-9]{24}$/i.test(value.productId)) return null;
  return { id: window.crypto.randomUUID(), text: value.text.trim(),
    ...(value.productId ? { productId: value.productId, productName: typeof value.productName === 'string' ? value.productName.slice(0,200) : 'Đôi giày đang cân nhắc' } : {}),
  };
};
