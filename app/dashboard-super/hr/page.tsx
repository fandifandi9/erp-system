"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, Search, MapPin, ShieldCheck, UserMinus, 
  Clock, AlertCircle, Check, X, Navigation, Eye, ExternalLink
} from 'lucide-react';

export default function HRDashboardSaaS() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // DATA DUMMY STAFF (Implementasi Poin 4: Tanggal Gabung & Status Otomatis)
  const [staffs] = useState([
    { id: "ERP-001", nama: "Fandi Ahmad", divisi: "Gudang", join: "15 Jan 2024", status: "Aktif", koordinat: "-6.123, 106.456" },
    { id: "ERP-002", nama: "Andi Saputra", divisi: "Admin", join: "01 Feb 2024", status: "Aktif", koordinat: "-6.214, 106.845" },
    { id: "ERP-003", nama: "Budi Utomo", divisi: "Logistik", join: "10 Mar 2024", status: "Resign", koordinat: "Unknown" },
  ]);

  // DATA DUMMY APPROVAL (Implementasi Poin 3: Absen Luar Radius)
  const [pendingAbsen] = useState([
    { id: 101, nama: "Rian Ardi", waktu: "08:10 AM", jarak: "2.5 KM", lokasi: "Depok", koordinat: "-6.402, 106.794" }
  ]);

  // FUNGSI PING LOKASI (Implementasi Poin 1)
  const handlePingLocation = (nama: string, koordinat: string) => {
    if (koordinat === "Unknown") return alert("Karyawan tidak aktif.");
    alert(`Mencari posisi ${nama}...`);
    window.open(`https://google.com{koordinat}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-4 md:p-10 font-sans text-slate-900 selection:bg-indigo-100">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER SAAS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Staff Management</h1>
            <p className="text-slate-500 text-sm font-medium">Monitoring GPS, Persetujuan Absensi, & Data Karyawan.</p>
          </div>
          <div className="flex gap-3">
             <button className="bg-white border border-slate-200 px-6 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all text-sm">Log Lembur</button>
             <button className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-sm">+ Tambah Staff</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* KOLOM KIRI: DAFTAR STAFF (POIN 2 & 4) */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Cari Nama / ID Staff..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
              </div>
              
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-6">Identitas Staff</th>
                    <th className="p-6">Tgl Gabung</th>
                    <th className="p-6">Status Akun</th>
                    <th className="p-6 text-center">Aksi / Tracking</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffs.map((s) => (
                    <tr key={s.id} className={`group hover:bg-slate-50/50 transition-all ${s.status === 'Resign' ? 'opacity-50' : ''}`}>
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-xs">{s.nama.charAt(0)}</div>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{s.nama}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{s.id} • {s.divisi}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6 text-[11px] font-bold text-slate-500">{s.join}</td>
                      <td className="p-6">
                        <span className={`text-[9px] font-black px-3 py-1 rounded-md uppercase ${s.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => router.push('/dashboard-super/hr/staff-detail')} className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit Data"><ShieldCheck size={18}/></button>
                          <button 
                            disabled={s.status === 'Resign'}
                            onClick={() => handlePingLocation(s.nama, s.koordinat)}
                            className="p-2.5 bg-slate-50 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all" 
                            title="Ping Lokasi (POIN 1)"
                          >
                            <MapPin size={18}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* KOLOM KANAN: APPROVAL LUAR RADIUS (POIN 3) */}
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-7 border border-slate-100 shadow-sm">
              <h2 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <AlertCircle className="text-orange-500" size={16} /> Approval Luar Radius
              </h2>
              
              {pendingAbsen.map((item) => (
                <div key={item.id} className="p-5 bg-orange-50/50 rounded-[2rem] border border-orange-100 mb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold text-sm text-slate-800">{item.nama}</p>
                      <p className="text-[10px] text-orange-600 font-black uppercase">Jarak: {item.jarak}</p>
                    </div>
                    <button onClick={() => handlePingLocation(item.nama, item.koordinat)} className="p-2 bg-white rounded-full text-orange-500 shadow-sm"><Navigation size={14}/></button>
                  </div>
                  
                  <div className="flex gap-2">
                    <button className="flex-1 bg-white text-emerald-600 text-[10px] font-black py-2.5 rounded-xl shadow-sm border border-emerald-100 flex items-center justify-center gap-1 hover:bg-emerald-50 transition-all uppercase">Terima</button>
                    <button className="flex-1 bg-white text-red-500 text-[10px] font-black py-2.5 rounded-xl shadow-sm border border-red-100 flex items-center justify-center gap-1 hover:bg-red-50 transition-all uppercase">Tolak</button>
                  </div>
                </div>
              ))}
              <p className="text-[9px] text-slate-400 italic text-center mt-4">* Cek foto & GPS sebelum menyetujui.</p>
            </div>

            {/* MONITORING LEMBUR (POIN 5) */}
            <div className="bg-indigo-900 rounded-[2.5rem] p-7 text-white shadow-xl shadow-indigo-100">
               <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-indigo-300 mb-6 flex items-center gap-2">
                 <Clock size={16} /> Status Lembur
               </h3>
               <div className="py-10 text-center border border-indigo-800 border-dashed rounded-3xl">
                 <p className="text-[11px] text-indigo-300 font-medium px-4">Belum ada pengajuan lembur baru dari staff.</p>
               </div>
               <button className="w-full mt-6 bg-white/10 hover:bg-white/20 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Tunjuk Lembur Staff</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}