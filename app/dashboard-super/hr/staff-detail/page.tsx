"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, User, ShieldCheck, Banknote, MapPin } from 'lucide-react';

export default function StaffDetailAdmin() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-black">
      <div className="max-w-4xl mx-auto">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 bg-white rounded-xl shadow-sm border border-slate-200">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-black">Edit Data Staff</h1>
          </div>
          <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all">
            <Save size={18} /> Simpan Perubahan
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* GRUP 1: IDENTITAS (POV ADMIN) */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-5">
            <div className="flex items-center gap-3 mb-2 text-indigo-600">
              <User size={20} />
              <h2 className="font-black uppercase text-xs tracking-widest">Identitas Dasar</h2>
            </div>
            
            <InputLabel label="ID Staff" placeholder="ERP-2024-001" readonly />
            <InputLabel label="NIK / NPWP" placeholder="3210XXXXXXXXXXXX" />
            <InputLabel label="Nama Lengkap" placeholder="Fandi Ahmad" />
            <InputLabel label="Nomor Telepon" placeholder="0812XXXXXXXX" />
            <InputLabel label="Email" placeholder="fandi@perusahaan.com" />
          </div>

          {/* GRUP 2: JABATAN & DIVISI */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-5">
            <div className="flex items-center gap-3 mb-2 text-blue-600">
              <ShieldCheck size={20} />
              <h2 className="font-black uppercase text-xs tracking-widest">Struktur Organisasi</h2>
            </div>
            
            <div className="space-y-1 text-black">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Divisi</label>
              <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                <option>Gudang</option>
                <option>Administrasi</option>
                <option>Operasional</option>
              </select>
            </div>
            <InputLabel label="Jabatan" placeholder="Supervisor" />
          </div>

          {/* GRUP 3: PAYROLL & POTONGAN */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-3 flex items-center gap-3 text-emerald-600">
              <Banknote size={20} />
              <h2 className="font-black uppercase text-xs tracking-widest">Pengaturan Payroll (Bulanan)</h2>
            </div>
            
            <InputLabel label="Gaji Pokok (Rp)" placeholder="5.000.000" />
            <InputLabel label="Potongan Telat (per 15m)" placeholder="10.000" />
            <InputLabel label="Potongan Alpa (per hari)" placeholder="200.000" />
            <div className="md:col-span-3">
              <InputLabel label="Kompensasi Cuti (per hari tidak digunakan)" placeholder="150.000" />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Komponen Input Kecil (Sudah diperbaiki tipe datanya)
function InputLabel({ label, placeholder, readonly = false }: { 
  label: string; 
  placeholder: string; 
  readonly?: boolean 
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{label}</label>
      <input 
        type="text" 
        readOnly={readonly}
        defaultValue={placeholder}
        className={`w-full p-4 rounded-2xl font-bold outline-none border transition-all ${
          readonly 
            ? 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed' 
            : 'bg-slate-50 border-slate-200 text-black focus:ring-2 focus:ring-indigo-500'
        }`}
      />
    </div>
  );
}