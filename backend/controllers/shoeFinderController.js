import mongoose from 'mongoose';
import Product from '../models/productModel.js';
import { httpError } from '../utils/validation.js';
import { availableFinderSelections, finderCandidate, retainFinderCandidate, normalizeFinderPreferences } from '../../shared/shoeFinder.js';

const visibleStock = { isHidden: { $ne: true }, isArchived: { $ne: true }, countInStock: { $gt: 0 } };
const fields = '_id name image brand category material origin style price discountPercent countInStock variants sizes color recommendation rating numReviews';
const ready = () => { if (mongoose.connection.readyState !== 1) throw httpError(503, 'Tư vấn chọn giày tạm thời chưa sẵn sàng. Vui lòng thử lại sau.'); };

export const getShoeFinderOptions = async (req, res) => {
  ready();
  const sizes = new Set(), colors = new Map();
  for await (const product of Product.find(visibleStock).select('countInStock variants sizes color isHidden isArchived').lean().cursor()) {
    for (const row of availableFinderSelections(product)) {
      sizes.add(row.size);
      if (row.color && colors.size < 100) colors.set(row.color.trim().normalize('NFC').toLocaleLowerCase('vi-VN'), row.color);
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json({ sizes: [...sizes].sort((a, b) => a - b), colors: [...colors.values()].sort((a, b) => a.localeCompare(b, 'vi')) });
};

export const getShoeRecommendations = async (req, res) => {
  const preferences = normalizeFinderPreferences(req.body);
  ready();
  const exactColor = preferences.color ? { $regex: '^' + preferences.color.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&') + '$', $options: 'i' } : undefined;
  const filter = { ...visibleStock, $or: [
    { variants: { $elemMatch: { size: preferences.size, quantity: { $gt: 0 }, ...(exactColor ? { color: exactColor } : {}) } } },
    { 'variants.0': { $exists: false }, sizes: preferences.size, ...(exactColor ? { color: exactColor } : {}) },
  ] };
  const items = [];
  // Stream candidates and retain three: catalogue size does not inflate response or working memory.
  for await (const product of Product.find(filter).select(fields).lean().cursor()) {
    retainFinderCandidate(items, finderCandidate(product, preferences));
  }
  res.set('Cache-Control', 'no-store');
  res.json({ preferences, items });
};
