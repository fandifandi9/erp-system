"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Smartphone, LogIn, X, LayoutDashboard, Eye, EyeOff, Lock } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === "super@erp.com" && password === "super123") {
      router.push('/dashboard-super');
    } else if (email === "admin@erp.com" && password === "admin123") {
      router.push('/dashboard-inventory');
    } else {
      alert("Email atau Password Salah!");
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* NAVBAR */}
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <LayoutDashboard size={20} />
          </div>
          <span className="text-xl font-black tracking-tighter">ERP CORE</span>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold shadow-md hover:bg-indigo-700 transition-all active:scale-95">
          Masuk Sistem
        </button>
      </nav>

      {/* HERO SECTION */}
      <main className="max-w-4xl mx-auto text-center pt-20 px-6">
        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 text-slate-900">
          Kelola Bisnis Anda <br /> <span className="text-indigo-600">Dalam Genggaman.</span>
        </h1>
        <p className="text-slate-500 text-lg mb-10 max-w-2xl mx-auto">Sistem ERP modern pendukung Absensi GPS, Stok, dan Pembukuan. Support PWA untuk instalasi di HP.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="flex items-center justify-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl">
            <Smartphone size={20} /> Unduh Aplikasi
          </button>
        </div>
      </main>

      {/* MODAL LOGIN (POPUP) */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl relative">
            <button onClick={() => setShowModal(false)} className="absolute right-6 top-6 p-2 hover:bg-slate-100 rounded-full text-slate-400">
              <X size={20} />
            </button>
            
            <div className="text-center mb-8">
              <div className="bg-indigo-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600"><Lock size={28} /></div>
              <h2 className="text-2xl font-black text-slate-800">Portal Login</h2>
              <p className="text-slate-400 text-sm">Gunakan akun dummy untuk mencoba</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
                <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="super@erp.com" className="w-full mt-1.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-black" required />
              </div>

              <div>
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <button type="button" className="text-xs font-bold text-indigo-600 hover:underline">Lupa Password?</button>
                </div>
                <div className="relative mt-1.5">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password} onChange={(e)=>setPassword(e.target.value)}
                    placeholder="••••••••" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-black pr-12" required 
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 mt-4">
                Masuk Sekarang
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}