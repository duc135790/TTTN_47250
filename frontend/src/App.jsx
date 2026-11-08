import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import StoreFooter from './components/StoreFooter';
import AdminRoute from './components/AdminRoute';
import StaffRoute, { ShoppingRoute } from './components/StaffRoute';
import StaffWorkspace from './pages/StaffWorkspace';
import ChatWidget from './components/ChatWidget';
import './components/product-detail.css';
import './components/vouchers.css';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import VnpayReturn from './pages/VnpayReturn';
import MyOrders from './pages/MyOrders';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Vouchers from './pages/Vouchers';
const ShoeFinder = lazy(() => import('./pages/ShoeFinder'));

function App() {
  
  return (
    <AuthProvider>
      <Router>
        <div className="shop-app min-h-screen bg-gray-50">
          <a href="#main-content" className="shop-skip-link">Đến nội dung chính</a>
          <Navbar />
          <main id="main-content" className="shop-main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/staff/login" element={<Navigate to="/login" replace state={{ from: '/staff' }} />} />
            <Route element={<StaffRoute />}><Route path="/staff" element={<StaffWorkspace />} /></Route>
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/products" element={<Products />} />
            <Route path="/shoe-finder" element={<Suspense fallback={<div className="container mx-auto px-4 py-16 text-center" role="status">Đang mở phần chọn giày...</div>}><ShoeFinder /></Suspense>} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route element={<ShoppingRoute />}>
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-vouchers" element={<Vouchers mine />} />
            </Route>
            <Route path="/offers" element={<Vouchers />} />
            <Route path="/payment/vnpay/return" element={<VnpayReturn />} />
            <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<div className="container mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-bold mb-4">Không tìm thấy trang</h1><Link to="/products" className="text-red-600 hover:underline">Khám phá bộ sưu tập giày</Link></div>} />

          </Routes>
          </main>
          <StoreFooter />
          <ChatWidget />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
