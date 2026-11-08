import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaComments, FaTimes } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { chatAPI } from '../utils/api';
import { captureChatSession, isChatCustomer } from '../utils/chat';
import useChatThread from '../hooks/useChatThread';
import ChatThread from './ChatThread';
import './chat.css';
import { FINDER_CHAT_EVENT, normalizeFinderHandoff } from '../utils/shoeFinder';

function CustomerChat({ user }) {
  const [open, setOpen] = useState(false), [summary, setSummary] = useState(null);
  const [consultationDraft, setConsultationDraft] = useState(null);
  const launcher = useRef(null), viewport = useRef(null);
  const location = useLocation();
  const thread = useChatThread({ customer: true, enabled: open });
  const productId = /^\/products\/([a-f0-9]{24})\/?$/i.exec(location.pathname)?.[1];
  const close = () => { if (thread.conversation) setSummary(thread.conversation); setOpen(false); launcher.current?.focus(); };
  useEffect(() => {
    const receive = event => {
      if (!isChatCustomer(user) || !captureChatSession(user).current()) return;
      const next = normalizeFinderHandoff(event.detail);
      if (next) { setConsultationDraft(next); setOpen(true); }
    };
    window.addEventListener(FINDER_CHAT_EVENT, receive);
    return () => window.removeEventListener(FINDER_CHAT_EVENT, receive);
  }, [user?._id, user?.accountType]);
  useEffect(() => {
    if (!user || open) return undefined;
    let active = true, busy = false; const controller = new AbortController(), session = captureChatSession(user);
    const update = async () => {
      if (busy || !session.current() || document.visibilityState === 'hidden') return;
      busy = true;
      try { const { data } = await chatAPI.mine({ token: session.token, signal: controller.signal }); if (active && session.current()) setSummary(data); }
      catch { /* Opening the panel shows the actionable error and retry. */ }
      finally { busy = false; }
    };
    update(); const timer = setInterval(update, 10000); document.addEventListener('visibilitychange', update);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [user, open]);
  useEffect(() => {
    if (!open) return undefined;
    viewport.current?.querySelector('.consult-panel__header button')?.focus();
    const escape = event => { if (event.key === 'Escape' && !event.isComposing) close(); };
    const resize = () => {
      const visual = window.visualViewport;
      viewport.current?.classList.toggle('consult-widget--keyboard', Boolean(visual && window.innerHeight - visual.height > 120));
      viewport.current?.style.setProperty('--consult-height', `${visual?.height || window.innerHeight}px`);
      viewport.current?.style.setProperty('--consult-keyboard', `${visual ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop) : 0}px`);
    };
    resize(); window.addEventListener('keydown', escape); window.visualViewport?.addEventListener('resize', resize);
    return () => { window.removeEventListener('keydown', escape); window.visualViewport?.removeEventListener('resize', resize); };
  }, [open]);
  const conversation = thread.conversation || summary;
  const unread = open ? thread.conversation?.unread : summary?.unread;
  return <aside ref={viewport} className={`consult-widget${open ? ' consult-widget--open' : ''}`} aria-label="Tư vấn giày">
    {open && <section className="consult-panel" role="dialog" aria-label="Nhân viên tư vấn">
      <header className="consult-panel__header"><div className="consult-avatar"><FaComments aria-hidden="true" /></div><div><h2>Nhân viên tư vấn</h2><p>{conversation?.state === 'closed' ? 'Gửi tin mới để tiếp tục được hỗ trợ' : conversation?.advisorName ? `${conversation.advisorName} đang phụ trách` : 'Để lại tin nhắn · Cửa hàng sẽ phản hồi'}</p></div><button type="button" onClick={close} aria-label="Đóng khung tư vấn"><FaTimes /></button></header>
      {user ? <ChatThread thread={thread} customer productId={productId} consultationDraft={consultationDraft} onConsultationHandled={id => setConsultationDraft(current => current?.id === id ? null : current)} /> : <div className="consult-guest"><div className="consult-guest__icon"><FaComments /></div><h3>Cùng tìm đôi giày phù hợp</h3><Link to="/login" state={{ from: location.pathname + location.search }}>Đăng nhập để nhắn tin</Link><Link to="/register" className="consult-guest__register">Chưa có tài khoản? Đăng ký</Link></div>}
    </section>}
    <button ref={launcher} type="button" className="consult-launcher" aria-label="Nhân viên tư vấn" aria-expanded={open} onClick={() => setOpen(value => !value)}><FaComments aria-hidden="true" /><span>Nhân viên tư vấn</span>{unread && <i aria-label="Có tin nhắn mới" className="consult-unread" />}</button>
  </aside>;
}

export default function ChatWidget() {
  const { user, loading } = useAuth();
  if (loading || user && !isChatCustomer(user)) return null;
  return <CustomerChat key={user?._id || 'guest'} user={user} />;
}
