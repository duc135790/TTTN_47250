import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductSuggestionPicker } from './ConsultationProducts';

export default function ChatThread({ thread, customer = false, canReply = true, productId, consultationDraft, onConsultationHandled }) {
  const [draft, setDraft] = useState('');
  const [product, setProduct] = useState(undefined);
  const [choosingProduct, setChoosingProduct] = useState(false);
  const scroller = useRef(null), nearBottom = useRef(true), oldHeight = useRef(null);
  const textArea = useRef(null);
  const handledConsultation = useRef(null);
  const [pendingConsultation, setPendingConsultation] = useState(null);
  const [consultationError, setConsultationError] = useState('');
  const { conversation, messages } = thread;
  useEffect(() => {
    if (!customer || !consultationDraft || handledConsultation.current === consultationDraft.id) return;
    handledConsultation.current = consultationDraft.id;
    if (draft.trim() || thread.sending) { setPendingConsultation(consultationDraft); return; }
    setDraft(consultationDraft.text);
    setProduct(consultationDraft.productId ? { id: consultationDraft.productId, name: consultationDraft.productName } : undefined);
    setPendingConsultation(null); setConsultationError('');
    onConsultationHandled?.(consultationDraft.id);
  }, [consultationDraft?.id, customer]);
  const applyConsultation = () => {
    if (!pendingConsultation || thread.sending) return;
    const next = [draft.trim(), pendingConsultation.text].filter(Boolean).join('\n\n');
    if (next.length > 2000) { setConsultationError('Tin nhắn hiện tại quá dài để thêm nhu cầu. Bạn có thể gửi nội dung đang soạn trước.'); return; }
    setDraft(next);
    if (pendingConsultation.productId) setProduct({ id: pendingConsultation.productId, name: pendingConsultation.productName });
    onConsultationHandled?.(pendingConsultation.id);
    setPendingConsultation(null); setConsultationError(''); textArea.current?.focus();
  };
  useEffect(() => { thread.setReadVisible?.(true); return () => thread.setReadVisible?.(false); }, []);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (oldHeight.current !== null) { if (thread.loadingOlder) return; element.scrollTop += element.scrollHeight - oldHeight.current; oldHeight.current = null; }
    else if (nearBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages, thread.loadingOlder]);
  const submit = async event => {
    event.preventDefault();
    if (!canReply || thread.sending || thread.loading || !draft.trim()) return;
    nearBottom.current = true;
    if (await thread.send(draft, product?.id)) { setDraft(''); setProduct(undefined); textArea.current?.focus(); }
  };
  const prompt = (text, id) => { setDraft(text); setProduct(id ? { id, name: 'Đôi giày đang xem' } : undefined); textArea.current?.focus(); };
  const disabled = !canReply || thread.unavailable || thread.loading || thread.sending;
  return <div className="consult-thread">
    {thread.loadError && <div role="alert" className="consult-error">{thread.loadError}<button type="button" onClick={thread.reload}>Thử lại</button></div>}
    <div className="consult-messages" ref={scroller} role="log" aria-label="Lịch sử tư vấn" aria-live="polite" aria-relevant="additions" onScroll={() => {
      const element = scroller.current; const wasNearBottom = nearBottom.current;
      nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
      thread.setReadVisible?.(nearBottom.current);
      if (!wasNearBottom && nearBottom.current) thread.reload();
    }}>
      {thread.hasOlder && <button type="button" className="consult-older" disabled={thread.loadingOlder} onClick={() => { oldHeight.current = scroller.current.scrollHeight; thread.loadOlder(); }}>{thread.loadingOlder ? 'Đang tải...' : 'Xem tin nhắn trước'}</button>}
      {thread.loading && !messages.length && <p className="consult-empty" role="status">Đang tải cuộc trò chuyện...</p>}
      {!thread.loading && !messages.length && !thread.unavailable && <div className="consult-empty"><strong>{customer ? 'Cửa hàng có thể giúp gì cho bạn?' : 'Cuộc trò chuyện chưa có tin nhắn.'}</strong></div>}
      {messages.map(message => <article key={message.seq} className={`consult-message${(customer ? message.side === 'customer' : message.side === 'store') ? ' consult-message--mine' : ''}`}>
        <span className="consult-message__sender">{message.side === 'store' ? message.senderName : customer ? 'Bạn' : message.senderName}</span>
        <div className="consult-message__bubble">
          {message.product && <Link to={`/products/${message.product.id}`} className="consult-product"><img src={message.product.image || '/shoe.svg'} alt="" /><span>{message.product.recommendation && <small>Giày được gợi ý</small>}{message.product.name}{Number.isSafeInteger(message.product.price) && <small>Giá tham khảo: {message.product.price.toLocaleString('vi-VN')}₫</small>}<small>Xem sản phẩm →</small></span></Link>}
          <p>{message.text}</p>
        </div>
        <span className="consult-message__time">{new Date(message.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}{message.side === (customer ? 'customer' : 'store') && <span> · {message.seq <= (conversation?.otherReadSeq || 0) ? (customer ? 'Cửa hàng đã xem' : 'Khách đã xem') : 'Đã gửi'}</span>}</span>
      </article>)}
    </div>
    {customer && !messages.length && !thread.loading && <div className="consult-prompts" aria-label="Gợi ý nhu cầu tư vấn">{['Mình cần tư vấn chọn size giày.', 'Mình muốn tìm giày phù hợp với nhu cầu và ngân sách.'].map(text => <button type="button" key={text} onClick={() => prompt(text)}>{text.includes('size') ? 'Tư vấn chọn size' : 'Tìm giày phù hợp'}</button>)}</div>}
    {thread.sendError && <p className="consult-error" role="alert">{thread.sendError}</p>}
    {customer && pendingConsultation && <div className="consult-context"><span>Nhu cầu chọn giày của bạn đã sẵn sàng.</span><button type="button" disabled={thread.sending} onClick={applyConsultation}>Thêm vào tin đang soạn</button><button type="button" aria-label="Bỏ nội dung tư vấn mới" onClick={() => { onConsultationHandled?.(pendingConsultation.id); setPendingConsultation(null); setConsultationError(''); }}>×</button></div>}
    {consultationError && <p role="alert" className="consult-error">{consultationError}</p>}
    {!canReply && !customer && <p className="consult-readonly">{conversation?.state === 'closed' ? 'Phiên tư vấn đã kết thúc.' : 'Bạn chưa phụ trách cuộc tư vấn này.'}</p>}
    <form className="consult-compose" onSubmit={submit}>
      {customer && productId && !product && <button type="button" className="consult-context-button" disabled={disabled} onClick={() => prompt('Mình muốn được tư vấn về đôi giày này.', productId)}>Hỏi về đôi giày đang xem</button>}
      {!customer && <button type="button" className="consult-context-button" disabled={disabled} onClick={() => setChoosingProduct(true)}>Chọn giày để gợi ý</button>}
      {product && <div className="consult-context">{customer ? 'Đã đính kèm: ' : 'Sẽ gợi ý: '}{product.name}<button type="button" aria-label="Bỏ đôi giày đính kèm" disabled={thread.sending} onClick={() => setProduct(undefined)}>×</button></div>}
      <label className="sr-only" htmlFor={customer ? 'customer-chat-text' : 'advisor-chat-text'}>Nội dung tin nhắn</label>
      <textarea ref={textArea} id={customer ? 'customer-chat-text' : 'advisor-chat-text'} rows={2} maxLength={2000} value={draft} disabled={disabled} placeholder={customer ? 'Nhập nhu cầu về giày của bạn...' : 'Nhập nội dung tư vấn...'} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); }
      }} />
      <div className="consult-compose__footer"><span>{draft.length}/2000 · Shift + Enter xuống dòng</span><button type="submit" disabled={disabled || !draft.trim()}>{thread.sending ? 'Đang gửi...' : 'Gửi tin'}</button></div>
    </form>
    {choosingProduct && !customer && canReply && !thread.unavailable && <ProductSuggestionPicker onClose={() => setChoosingProduct(false)} onChoose={shoe => {
      const oldDefault = product ? `Mình gợi ý bạn tham khảo ${product.name}.` : '';
      setProduct({ id: shoe._id, name: shoe.name });
      setDraft(previous => !previous.trim() || previous === oldDefault ? `Mình gợi ý bạn tham khảo ${shoe.name}.` : previous);
      setChoosingProduct(false); textArea.current?.focus();
    }} />}
  </div>;
}
