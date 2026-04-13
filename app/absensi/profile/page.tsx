"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, FileText, Download, ChevronRight, User } from 'lucide-react';

export default function StaffProfile() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white font-sans text-black p-6">
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.push('/absensi')} className="p-2 bg-slate-50 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-black">Profil Saya</h1>
      </div>

      {/* FOTO PROFIL & UNGGAH */}
      <div className="flex flex-col items-center mb-10">
        <div className="relative group">
          <div className="w-32 h-32 bg-slate-100 rounded-full border-4 border-indigo-50 flex items-center justify-center overflow-hidden">
            <User size={64} className="text-slate-300" />
          </div>
          <label className="absolute bottom-0 right-0 bg-indigo-600 p-2.5 rounded-full text-white shadow-lg cursor-pointer active:scale-95 transition-all">
            <Camera size={18} />
            <input type="file" className="hidden" accept="image/*" />
          </label>
        </div>
        <h2 className="mt-4 text-xl font-bold">Fandi Ahmad</h2>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Supervisor - Gudang</p>
      </div>

      {/* MENU UNDUH SLIP GAJI */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Slip Gaji Digital</h3>
        
        {['April 2026', 'Maret 2026', 'Februari 2026'].map((bulan) => (
          <div key={bulan} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-2xl text-red-500 shadow-sm">
                <FileText size={20} />
              </div>
              <p className="font-bold text-sm text-slate-700">{bulan}</p>
            </div>
            <button className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] font-black shadow-sm hover:bg-indigo-50 transition-all">
              <Download size={14} /> UNDUH
            </button>
          </div>
        ))}
      </div>

      {/* FOOTER INFO */}
      <div className="mt-12 p-6 bg-indigo-50 rounded-[2.5rem] border border-indigo-100">
        <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">Informasi Akun</p>
        <div className="space-y-3 text-xs font-bold text-indigo-700">
          <p className="flex justify-between">ID Staff: <span>ERP-2024-001</span></p>
          <p className="flex justify-between">Status Akun: <span className="text-emerald-600">Terverifikasi</span></p>
        </div>
      </div>
    </div>
  );
}