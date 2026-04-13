"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Box, Search, Plus, ArrowLeft, ArrowUpRight, ArrowDownLeft, 
  AlertTriangle, Filter, Edit3, MoreHorizontal, Package
} from 'lucide-react';

export default function InventoryDashboard() {
  const router = useRouter();

  // 1. DATA DUMMY STOK BARANG (SKU MANAGEMENT)
  const [products] = useState([
    { id: "SKU-001", nama: "Laptop Pro 14", kategori: "Elektronik", stok: 15, satuan: "Unit", status: "Aman" },
    { id: "SKU-002", nama: "Mouse Wireless", kategori: "Aksesoris", stok: 5, satuan: "Pcs", status: "Kritis" },
    { id: "SKU-003", nama: "Keyboard Mech", kategori: "Aksesoris", stok: 0, satuan: "Pcs", status: "Habis" },
  ]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-6 md:p-10 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER & NAVIGASI */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard-super')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 shadow-sm transition-all">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Manajemen Stok</h1>
              <p className="text-slate-500 text-sm font-medium italic">Kontrol Inventaris & Logistik Gudang</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button className="bg-white border border-slate-200 px-6 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all text-sm flex items-center gap-2">
               <ArrowUpRight size={18} /> Barang Keluar
             </button>
             <button className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm flex items-center gap-2">
                <Plus size={18} /> Tambah SKU Baru
             </button>
          </div>
        </div>

        {/* WIDGET RINGKASAN STOK */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-black">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center"><Package size={28}/></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Item SKU</p>
              <h3 className="text-2xl font-black">1,280 <span className="text-xs font-normal text-slate-400">Items</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center"><AlertTriangle size={28}/></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Kritis</p>
              <h3 className="text-2xl font-black text-red-600">12 <span className="text-xs font-normal text-slate-400">Perlu Restock</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center"><ArrowDownLeft size={28}/></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barang Masuk (Hari Ini)</p>
              <h3 className="text-2xl font-black text-emerald-600">145 <span className="text-xs font-normal text-slate-400">Unit</span></h3>
            </div>
          </div>
        </div>

        {/* TABEL MASTER INVENTORY */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 bg-white">
            <h2 className="font-bold text-lg text-black">Daftar Inventaris Gudang</h2>
            <div className="flex gap-2 w-full md:w-auto text-black">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Cari nama barang / SKU..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button className="p-2.5 bg-slate-50 text-slate-500 rounded-xl hover:bg-slate-100"><Filter size={18}/></button>
            </div>
          </div>
          
          <table className="w-full text-left text-black">
            <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="p-6">Detail Barang & SKU</th>
                <th className="p-6">Kategori</th>
                <th className="p-6">Stok Saat Ini</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-all group">
                  <td className="p-6">
                    <div>
                      <p className="font-bold text-sm text-slate-800">{p.nama}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{p.id}</p>
                    </div>
                  </td>
                  <td className="p-6 text-xs font-bold text-slate-500">{p.kategori}</td>
                  <td className="p-6">
                    <p className="text-sm font-black text-slate-800">{p.stok} <span className="text-[10px] font-normal text-slate-400">{p.satuan}</span></p>
                  </td>
                  <td className="p-6">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-md uppercase ${
                      p.status === 'Aman' ? 'bg-green-100 text-green-700' : 
                      p.status === 'Kritis' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center gap-2">
                       <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit3 size={18}/></button>
                       <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"><MoreHorizontal size={18}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
