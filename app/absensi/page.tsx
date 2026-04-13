"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Pastikan semua ikon ini ada
import { 
  MapPin, Camera, Smartphone, LogOut, CheckCircle2, 
  Navigation, Calendar, X, Plus, Trash2, Banknote, Clock, AlertCircle 
} from 'lucide-react';

export default function StaffMobileApp() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("absen");
  const [status, setStatus] = useState<string>("BELUM ABSEN");
  const [time, setTime] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState<string>("");
  const rateKompensasi = 150000;

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('id-ID'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAbsen = () => {
    alert("⚠️ LUAR RADIUS! Absen dikirim ke HR untuk Approval.");
    setStatus("PENDING APPROVAL");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      
      {/* HEADER */}
      <div className="bg-indigo-600 p-6 pb-12 rounded-b-[2.5rem] shadow-lg text-white">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 opacity-80 font-black text-[10px] tracking-widest uppercase">
            <Navigation size={14} /> ERP Mobile
          </div>
          <button onClick={() => router.push('/')} className="p-2 bg-white/10 rounded-full"><LogOut size={16}/></button>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Staff Unit</p>
            <h1 className="text-xl font-black">Fandi Ahmad</h1>
          </div>
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 text-right">
            <p className="text-[8px] font-black text-indigo-200 uppercase">Estimasi Bonus Cuti</p>
            <p className="text-sm font-black text-white">Rp {((3 - selectedDates.length) * rateKompensasi).toLocaleString('id-ID')}</p>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 px-6 -mt-6 z-10 overflow-y-auto pb-32">
        {activeTab === "absen" && (
          <div className="animate-in fade-in duration-500">
            <div className="bg-white rounded-3xl p-5 shadow-xl border border-white mb-6">
              <div className="flex justify-between items-center border-b pb-3 mb-3">
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase">Waktu Server</p>
                  <p className="text-xl font-black text-indigo-600">{time}</p>
                </div>
                <span className="text-[9px] font-black px-3 py-1 rounded-full bg-orange-100 text-orange-600">{status}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <MapPin size={14} className="text-indigo-500" />
                <p className="text-[10px] font-bold italic text-black">Lokasi: Luar Radius</p>
              </div>
            </div>
            <div className="flex flex-col items-center py-8">
              <button onClick={handleAbsen} className="w-52 h-52 rounded-full bg-white shadow-2xl border-[10px] border-indigo-50 flex flex-col items-center justify-center active:scale-95 transition-all">
                <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white mb-2"><Camera size={28} /></div>
                <span className="font-black text-slate-800 text-[12px]">TAP TO ABSEN</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === "cuti" && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-lg font-black mb-4">Booking Libur</h2>
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 mb-4">
              <div className="flex gap-2 mb-6">
                <input type="date" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} className="flex-1 p-3 bg-slate-50 border rounded-xl font-bold text-sm text-black" />
                <button onClick={() => {setSelectedDates([...selectedDates, currentDate]); setCurrentDate("");}} className="bg-indigo-600 text-white p-3 rounded-xl"><Plus size={20}/></button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {selectedDates.map((d, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 text-black text-black">
                    <p className="text-xs font-bold">{d}</p>
                    <button onClick={() => setSelectedDates(selectedDates.filter(x => x !== d))}><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "lembur" && (
          <div className="animate-in fade-in duration-500">
            <h2 className="text-lg font-black mb-4">Pengajuan Lembur</h2>
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
              <input type="number" placeholder="Durasi (Jam)" className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-black" />
              <textarea placeholder="Pekerjaan" className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-black" rows={3}></textarea>
              <button onClick={() => alert("Diajukan!")} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black">KIRIM LEMBUR</button>
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-xl text-slate-400"><Smartphone size={18} /></div>
            <div>
              <p className="text-[9px] font-black text-slate-300 uppercase">Device ID</p>
              <p className="text-xs font-bold text-slate-700 italic">iPhone 13 - Secured</p>
            </div>
          </div>
          <CheckCircle2 size={20} className="text-blue-500" />
        </div>
      </div>

      {/* FOOTER NAV */}
      <div className="bg-white border-t p-4 pb-10 flex justify-around fixed bottom-0 w-full z-20 shadow-2xl">
        <button onClick={() => setActiveTab("absen")} className={`flex flex-col items-center gap-1 ${activeTab === 'absen' ? 'text-indigo-600' : 'text-slate-300'}`}>
          <Navigation size={22} />
          <span className="text-[9px] font-black uppercase tracking-widest">Absen</span>
        </button>
        <button onClick={() => setActiveTab("cuti")} className={`flex flex-col items-center gap-1 ${activeTab === 'cuti' ? 'text-indigo-600' : 'text-slate-300'}`}>
          <Calendar size={22} />
          <span className="text-[9px] font-black uppercase tracking-widest">Libur</span>
        </button>
        <button onClick={() => setActiveTab("lembur")} className={`flex flex-col items-center gap-1 ${activeTab === 'lembur' ? 'text-indigo-600' : 'text-slate-300'}`}>
          <Clock size={22} />
          <span className="text-[9px] font-black uppercase tracking-widest">Lembur</span>
        </button>
      </div>
    </div>
  );
}