import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaCheck, FaComments, FaShoePrints, FaSlidersH } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { cartAPI, productsAPI } from '../utils/api';
import { captureChatSession, isChatCustomer } from '../utils/chat';
import { productImageUrl } from '../utils/productVariants';
import { FINDER_CHAT_EVENT, FINDER_PURPOSES, FINDER_STYLES, emptyFinderAnswers, finderConsultationDraft, finderPreferencesFromSearch, finderSearch, finderStepError, normalizeFinderPreferences } from '../utils/shoeFinder';
import './shoe-finder.css';

const money = value => Number(value).toLocaleString('vi-VN') + '₫';
const questions = [
  ['Bạn sẽ mang giày khi nào?', 'Chọn nhu cầu chính để bắt đầu.'],
  ['Phong cách nào giống bạn?', 'Chọn gu bạn thích hoặc để chúng tôi gợi ý thêm.'],
  ['Bạn muốn dành bao nhiêu cho đôi giày?', 'Ngân sách tính theo giá bán sau giảm, chưa gồm vận chuyển.'],
  ['Bạn đang tìm size nào?', 'Dùng size EU bạn đang mang. Bạn có thể hỏi nhân viên thêm về độ vừa.'],
  ['Bạn có màu yêu thích không?', 'Chọn màu cần tìm hoặc khám phá tất cả màu còn hàng.'],
];

export function FinderResultCard({ item, checked, onCompare, onConsult, returnTo }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const operation = useRef(null), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true; setBusy(false); setNotice(null);
    return () => { mounted.current = false; operation.current?.controller.abort(); operation.current = null; };
  }, [user?._id, user?.accountType, item.product._id, item.selection.size, item.selection.color]);
  const addToCart = async () => {
    if (authLoading || operation.current) return;
    if (!user) { navigate('/login', { state: { from: returnTo } }); return; }
    if (user.accountType === 'staff') return;
    const session = captureChatSession(user);
    if (!session.current()) { setNotice({ ok: false, text: 'Phiên tài khoản đã thay đổi. Vui lòng đăng nhập lại.' }); return; }
    const task = { controller: new AbortController() }; operation.current = task;
    const active = () => mounted.current && operation.current === task && session.current();
    setBusy(true); setNotice(null);
    try {
      await cartAPI.addToCart(item.product._id, 1, item.selection.size, item.selection.color,
        { token: session.token, signal: task.controller.signal });
      if (active()) setNotice({ ok: true, text: 'Đã thêm 1 đôi vào giỏ.' });
    } catch (failure) {
      if (active()) setNotice({ ok: false, text: failure.response?.data?.message || 'Chưa thêm được vào giỏ. Vui lòng kiểm tra lại sản phẩm.' });
    } finally { if (active()) setBusy(false); if (operation.current === task) operation.current = null; }
  };
  const product = item.product;
  return <article className="finder-card">
    <Link className="finder-card__image" to={`/products/${product._id}`}><img src={productImageUrl(product.image)} alt={product.name} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/shoe.svg'; }} />{product.discountPercent > 0 && <span>−{product.discountPercent}%</span>}</Link>
    <div className="finder-card__body">
      <p className="finder-eyebrow">{product.brand}</p><h3><Link to={`/products/${product._id}`}>{product.name}</Link></h3>
      <p className="finder-card__price">{money(product.salePrice)} {product.discountPercent > 0 && <del>{money(product.originalPrice)}</del>}</p>
      <p className="finder-selection">Size {item.selection.size} · {item.selection.color || 'Màu theo sản phẩm'}</p>
      <ul className="finder-reasons">{item.reasons.map(reason => <li key={reason}><FaCheck aria-hidden="true" />{reason}</li>)}</ul>
      <label className="finder-compare-choice"><input type="checkbox" checked={checked} onChange={onCompare} />Chọn để so sánh</label>
      <div className="finder-card__actions">
        {user?.accountType === 'staff' ? <Link className="finder-button finder-button--primary" to="/staff?tab=inventory">Mở kho tư vấn</Link> : <button type="button" className="finder-button finder-button--primary" disabled={busy || authLoading} onClick={addToCart}>{busy ? 'Đang thêm…' : !user ? 'Đăng nhập để thêm giỏ' : 'Thêm vào giỏ'}</button>}
        <button type="button" className="finder-button" disabled={authLoading} onClick={() => onConsult(item)}><FaComments aria-hidden="true" />Nhờ tư vấn</button>
        <Link className="finder-detail-link" to={`/products/${product._id}`}>Xem chi tiết và chọn giày <FaArrowRight aria-hidden="true" /></Link>
      </div>
      {notice && <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'finder-notice finder-notice--success' : 'finder-notice'}>{notice.text}{notice.ok && <> <Link to="/cart">Xem giỏ hàng →</Link></>}</p>}
    </div>
  </article>;
}

export function FinderComparison({ items }) {
  return <section className="finder-comparison" aria-labelledby="finder-comparison-title"><h2 id="finder-comparison-title">Đặt cạnh nhau để dễ chọn</h2><div className="finder-table-scroll"><table><caption className="sr-only">So sánh những đôi giày đã chọn</caption><thead><tr><th scope="col">Thông tin</th>{items.map(item => <th key={item.product._id} scope="col"><Link to={`/products/${item.product._id}`}>{item.product.name}</Link></th>)}</tr></thead><tbody>{[
    ['Giá bán', item => money(item.product.salePrice)], ['Thương hiệu', item => item.product.brand],
    ['Danh mục', item => item.product.category], ['Màu và size còn hàng', item => `${item.selection.color || 'Theo sản phẩm'} · Size ${item.selection.size}`],
    ['Chất liệu', item => item.product.material || 'Chưa có thông tin'], ['Phong cách', item => item.product.style || 'Chưa có thông tin'],
  ].map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{items.map(item => <td key={item.product._id}>{value(item)}</td>)}</tr>)}</tbody></table></div></section>;
}

export default function ShoeFinder() {
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation(), navigate = useNavigate();
  const search = params.toString();
  const [answers, setAnswers] = useState(emptyFinderAnswers);
  const [step, setStep] = useState(0);
  const [options, setOptions] = useState({ sizes: [], colors: [] });
  const [result, setResult] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [comparison, setComparison] = useState([]), [compareOpen, setCompareOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(null), heading = useRef(null);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    productsAPI.getFinderOptions({ signal: controller.signal }).then(({ data }) => {
      if (active) setOptions({ sizes: Array.isArray(data?.sizes) ? data.sizes : [], colors: Array.isArray(data?.colors) ? data.colors : [] });
    }).catch(() => { /* Manual size and the optional colour choice remain usable. */ });
    return () => { active = false; controller.abort(); };
  }, []);
  useEffect(() => {
    const task = { controller: new AbortController() }; request.current = task;
    const active = () => request.current === task && !task.controller.signal.aborted;
    setResult(null); setComparison([]); setCompareOpen(false); setError(''); setLoading(false);
    if (search) {
      let preferences;
      try { preferences = finderPreferencesFromSearch(search); }
      catch (failure) { setError(failure.message); return () => { task.controller.abort(); if (request.current === task) request.current = null; }; }
      setAnswers({ ...preferences, maxPrice: String(preferences.maxPrice), size: String(preferences.size) });
      setLoading(true);
      productsAPI.recommendShoes(preferences, { signal: task.controller.signal }).then(({ data }) => {
        if (!active()) return;
        if (!Array.isArray(data?.items) || data.items.length > 3) throw new Error('Chưa tải được kết quả chọn giày.');
        setResult({ preferences, items: data.items }); setComparison(data.items.map(item => item.product._id));
      }).catch(failure => { if (active()) setError(failure.response?.data?.message || failure.message || 'Chưa tìm được gợi ý. Vui lòng thử lại.'); })
        .finally(() => { if (active()) setLoading(false); });
    }
    return () => { task.controller.abort(); if (request.current === task) request.current = null; };
  }, [search, reload]);
  const change = (field, value) => { setAnswers(previous => ({ ...previous, [field]: value })); setError(''); };
  const next = event => {
    event.preventDefault();
    const message = finderStepError(step, answers);
    if (message) { setError(message); return; }
    if (step < questions.length - 1) { setStep(previous => previous + 1); setError(''); heading.current?.focus(); return; }
    try { setParams(finderSearch(normalizeFinderPreferences(answers))); }
    catch (failure) { setError(failure.message); }
  };
  const edit = () => { setParams({}); setStep(0); };
  const consult = candidate => {
    if (authLoading || !result) return;
    if (!user) { navigate('/login', { state: { from: location.pathname + location.search } }); return; }
    if (!isChatCustomer(user)) { navigate(user.accountType === 'staff' ? '/staff?tab=chat' : '/admin'); return; }
    if (!captureChatSession(user).current()) { setError('Phiên tài khoản đã thay đổi. Vui lòng đăng nhập lại để tư vấn.'); return; }
    window.dispatchEvent(new window.CustomEvent(FINDER_CHAT_EVENT, { detail: finderConsultationDraft(result.preferences, candidate) }));
  };
  const selected = (result?.items || []).filter(item => comparison.includes(item.product._id));
  return <div className="finder-page"><div className="finder-shell">
    <nav className="finder-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Chọn giày dành cho bạn</span></nav>
    <header className="finder-heading"><div><p className="finder-eyebrow">MỖI NGƯỜI MỘT GU. MỖI BƯỚC MỘT LỰA CHỌN.</p><h1>Đôi giày tiếp theo,<br /><span>bắt đầu từ bạn.</span></h1><p>Vài lựa chọn nhỏ để tìm những đôi giày hợp nhu cầu, đúng ngân sách và còn size bạn cần.</p></div><div className="finder-heading__mark" aria-hidden="true"><FaShoePrints /><span>CHỌN ĐÚNG GU<br /><strong>BƯỚC TỰ TIN</strong></span></div></header>
    {!search ? <div className="finder-quiz-layout"><section className="finder-quiz" aria-labelledby="finder-question">
      <div className="finder-progress-label"><span>Câu {step + 1} / {questions.length}</span><span>Khoảng 60 giây</span></div><div className="finder-progress" role="progressbar" aria-label="Tiến độ chọn giày" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}><i style={{ width: `${(step + 1) * 20}%` }} /></div>
      <h2 id="finder-question" ref={heading} tabIndex={-1}>{questions[step][0]}</h2><p className="finder-question-note">{questions[step][1]}</p>
      <form onSubmit={next} noValidate>
        {step === 0 && <fieldset className="finder-choices"><legend className="sr-only">Mục đích sử dụng</legend>{FINDER_PURPOSES.map(item => <label key={item.value} className={answers.purpose === item.value ? 'is-selected' : ''}><input type="radio" name="purpose" value={item.value} checked={answers.purpose === item.value} onChange={() => change('purpose', item.value)} /><span>{item.label}</span>{answers.purpose === item.value && <FaCheck aria-hidden="true" />}</label>)}</fieldset>}
        {step === 1 && <fieldset className="finder-choices"><legend className="sr-only">Phong cách yêu thích</legend>{FINDER_STYLES.map(item => <label key={item.value} className={answers.style === item.value ? 'is-selected' : ''}><input type="radio" name="style" value={item.value} checked={answers.style === item.value} onChange={() => change('style', item.value)} /><span>{item.label}</span>{answers.style === item.value && <FaCheck aria-hidden="true" />}</label>)}</fieldset>}
        {step === 2 && <div className="finder-budget"><div className="finder-quick-options">{[1000000,2000000,3000000,5000000].map(value => <button key={value} type="button" aria-pressed={Number(answers.maxPrice) === value} onClick={() => change('maxPrice', String(value))}>Đến {money(value)}</button>)}</div><label htmlFor="finder-budget">Hoặc nhập ngân sách tối đa (đ)<input id="finder-budget" name="maxPrice" type="number" min="1" step="1" inputMode="numeric" value={answers.maxPrice} onChange={event => change('maxPrice', event.target.value)} /></label></div>}
        {step === 3 && <div className="finder-size"><label htmlFor="finder-size">Size EU<input id="finder-size" name="size" type="number" min="1" max="60" step="0.5" inputMode="decimal" placeholder="Ví dụ: 40 hoặc 40.5" value={answers.size} onChange={event => change('size', event.target.value)} /></label>{options.sizes.length > 0 && <><p>Chọn nhanh size đang có hàng</p><div className="finder-quick-options">{options.sizes.map(size => <button key={size} type="button" aria-pressed={Number(answers.size) === size} onClick={() => change('size', String(size))}>{size}</button>)}</div></>}</div>}
        {step === 4 && <label className="finder-color" htmlFor="finder-color">Màu giày<select id="finder-color" name="color" value={answers.color} onChange={event => change('color', event.target.value)}><option value="">Không có ưu tiên</option>{[...new Set([...options.colors, ...(answers.color ? [answers.color] : [])])].map(color => <option key={color} value={color}>{color}</option>)}</select></label>}
        {error && <p role="alert" className="finder-notice">{error}</p>}
        <div className="finder-quiz-actions">{step > 0 && <button type="button" className="finder-button" onClick={() => { setStep(previous => previous - 1); setError(''); }}><FaArrowLeft aria-hidden="true" />Quay lại</button>}<button type="submit" className="finder-button finder-button--primary">{step === 4 ? 'Tìm giày của tôi' : 'Tiếp tục'}<FaArrowRight aria-hidden="true" /></button></div>
      </form>
    </section><aside className="finder-promise"><FaSlidersH aria-hidden="true" /><h2>Ít lựa chọn hơn.<br />Dễ tìm đúng đôi hơn.</h2><ul><li>Gợi ý theo nhu cầu của bạn</li><li>Giá sau giảm trong ngân sách</li><li>Kiểm tra đúng màu và size còn hàng</li><li>Có nhân viên hỗ trợ khi bạn cần</li></ul><Link to="/products">Tự khám phá bộ sưu tập <FaArrowRight aria-hidden="true" /></Link></aside></div> : <section className="finder-results" aria-labelledby="finder-results-title">
      <div className="finder-results-heading"><div><p className="finder-eyebrow">LỰA CHỌN DÀNH CHO BẠN</p><h2 id="finder-results-title">{loading ? 'Đang tìm những đôi giày phù hợp…' : result?.items.length ? `${result.items.length} đôi giày để bạn cân nhắc` : 'Cùng tìm một lựa chọn khác'}</h2></div><button type="button" className="finder-button" onClick={edit}><FaSlidersH aria-hidden="true" />Đổi lựa chọn</button></div>
      {result && <div className="finder-summary"><span>{FINDER_PURPOSES.find(item => item.value === result.preferences.purpose)?.label}</span><span>Size {result.preferences.size}</span><span>{result.preferences.color || 'Mọi màu'}</span><span>Đến {money(result.preferences.maxPrice)}</span></div>}
      {loading && <div role="status" className="finder-loading"><div className="spinner" /><p>Đang đối chiếu nhu cầu với những đôi giày còn hàng.</p></div>}
      {error && <div role="alert" className="finder-notice">{error}<button type="button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div>}
      {result?.items.length === 0 && <div className="finder-empty"><FaShoePrints aria-hidden="true" /><h3>Chưa có đôi giày khớp lựa chọn của bạn</h3><p>Bạn có thể đổi màu, ngân sách hoặc nhờ nhân viên tìm thêm. Size bạn cần được giữ đúng khi tìm.</p><div><button className="finder-button finder-button--primary" type="button" onClick={edit}>Điều chỉnh lựa chọn</button><button className="finder-button" type="button" disabled={authLoading} onClick={() => consult()}>Nhờ nhân viên hỗ trợ</button></div></div>}
      {result?.items.length > 0 && <><div className="finder-results-grid">{result.items.map(item => <FinderResultCard key={`${search}:${item.product._id}`} item={item} checked={comparison.includes(item.product._id)} onCompare={() => { setComparison(previous => previous.includes(item.product._id) ? previous.filter(id => id !== item.product._id) : [...previous, item.product._id]); setCompareOpen(false); }} onConsult={consult} returnTo={location.pathname + location.search} />)}</div><div className="finder-results-toolbar"><button type="button" className="finder-button finder-button--primary" disabled={selected.length < 2} aria-expanded={compareOpen} onClick={() => setCompareOpen(value => !value)}>{compareOpen ? 'Ẩn so sánh' : `So sánh ${selected.length} đôi đã chọn`}</button><button type="button" className="finder-button" disabled={authLoading} onClick={() => consult()}><FaComments aria-hidden="true" />Cần nhân viên chọn giúp?</button><button type="button" className="finder-refresh" onClick={() => setReload(value => value + 1)}>Cập nhật gợi ý</button></div>{compareOpen && selected.length >= 2 && <FinderComparison items={selected} />}</>}
      <Link className="finder-back-catalog" to="/products">Khám phá toàn bộ giày <FaArrowRight aria-hidden="true" /></Link>
    </section>}
  </div></div>;
}
