"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Box, Search, Plus, ArrowLeft, ArrowUpRight, ArrowDownLeft, 
  AlertTriangle, Filter, Edit3, MoreHorizontal, Package, X, Save
} from 'lucide-react';

export default function InventoryDashboard() {
  const router = useRouter();
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState("Masuk");

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-6 md:p-10 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard-super')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 shadow-sm transition-all text-black">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-black">Manajemen Stok</h1>
              <p className="text-slate-500 text-sm font-medium italic">Kontrol Inventaris & Logistik Gudang</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button 
                onClick={() => { setTransactionType("Keluar"); setShowTransactionModal(true); }}
                className="bg-white border border-slate-200 px-6 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all text-sm flex items-center gap-2 shadow-sm"
             >
               <ArrowUpRight size={18} className="text-red-500" /> Barang Keluar
             </button>
             <button 
                onClick={() => { setTransactionType("Masuk"); setShowTransactionModal(true); }}
                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm flex items-center gap-2"
             >
                <Plus size={18} /> Update Stok (Masuk)
             </button>
          </div>
        </div>

        {/* WIDGETS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-black">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center"><Package size={28}/></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total SKU</p>
              <h3 className="text-2xl font-black">1,280</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center"><AlertTriangle size={28}/></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Kritis</p>
              <h3 className="text-2xl font-black text-red-600">12 Item</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center"><ArrowDownLeft size={28}/></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barang Masuk (Hari Ini)</p>
              <h3 className="text-2xl font-black text-emerald-600">145 Unit</h3>
            </div>
          </div>
        </div>

        {/* TABEL MASTER INVENTORY */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b flex justify-between items-center bg-white text-black">
            <h2 className="font-bold text-lg italic">Daftar Inventaris Gudang</h2>
            <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Cari nama barang..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <table className="w-full text-left text-black">
            <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="p-6">Detail SKU</th>
                <th className="p-6">Stok Saat Ini</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <tr className="hover:bg-slate-50/50 transition-all group">
                <td className="p-6 font-bold text-sm">Laptop Pro 14 (SKU-001)</td>
                <td className="p-6 font-black text-slate-800">15 <span className="font-normal text-slate-400 text-xs">Unit</span></td>
                <td className="p-6"><span className="text-[9px] font-black px-3 py-1 bg-green-100 text-green-700 rounded-md">AMAN</span></td>
                <td className="p-6 text-center text-slate-400"><Edit3 size={18} className="mx-auto" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TRANSAKSI STOK (MASUK/KELUAR) */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-800">Catat Barang {transactionType}</h2>
                <p className="text-xs text-slate-400 font-medium">Lengkapi detail mutasi stok gudang.</p>
              </div>
              <button onClick={() => setShowTransactionModal(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); alert(`Berhasil mencatat barang ${transactionType}!`); setShowTransactionModal(false); }} className="space-y-4 text-black">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pilih Produk (SKU)</label>
                <select className="w-full mt-1.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                  <option>Laptop Pro 14 (SKU-001)</option>
                  <option>Mouse Wireless (SKU-002)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Jumlah</label>
                  <input type="number" placeholder="0" className="w-full mt-1.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" required />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Satuan</label>
                  <input type="text" value="Unit" readOnly className="w-full mt-1.5 p-4 bg-slate-100 border-transparent rounded-2xl font-bold text-slate-400 outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Keterangan / Alasan</label>
                <textarea 
                  placeholder={transactionType === 'Masuk' ? "Contoh: Restock dari Supplier A" : "Contoh: Pesanan Toko Online"} 
                  className="w-full mt-1.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" 
                  rows={3}
                ></textarea>
              </div>

              <button type="submit" className={`w-full py-4 rounded-2xl font-black shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${transactionType === 'Masuk' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-red-600 shadow-red-100'} text-white`}>
                <Save size={18} /> Simpan Transaksi {transactionType}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
