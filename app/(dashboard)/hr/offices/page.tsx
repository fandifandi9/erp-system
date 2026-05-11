"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { MapPin, Plus, Edit2, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { canAccess, normalizeAuthModel } from "@/lib/rbac";

interface Office {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // Changed from radius_meter to match PocketBase
  is_active: boolean;
  address?: string;
  max_checkin_distance?: number;
  timezone?: string;
}

export default function OfficesPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    lat: "",
    lng: "",
    radius: "100",
    is_active: true,
    address: "",
    max_checkin_distance: "0",
    timezone: "Asia/Jakarta",
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const currentUser = pb.authStore.model;
  const hasAccess = !!currentUser && canAccess(currentUser, "/hr/offices");
  const isOwner = !!currentUser && normalizeAuthModel(currentUser).accountType === "owner";

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    fetchOffices();
  }, [hasAccess]);

  const fetchOffices = async () => {
    try {
      // Force fresh data dengan timestamp
      const result = await pb.collection("offices").getList(1, 50, {
        sort: "-created",
        requestKey: `offices_${Date.now()}`, // Force refresh
      });
      
      console.log("FETCHED OFFICES:", result.items);
      setOffices(result.items as unknown as Office[]);
    } catch (err) {
      console.error("Fetch offices error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (office?: Office) => {
    if (office) {
      setEditingOffice(office);
      setFormData({
        name: office.name || "",
        lat: (office.lat || 0).toString(),
        lng: (office.lng || 0).toString(),
        radius: (office.radius || 100).toString(),
        is_active: office.is_active ?? true,
        address: office.address || "",
        max_checkin_distance: (office.max_checkin_distance || 0).toString(),
        timezone: office.timezone || "Asia/Jakarta",
      });
    } else {
      setEditingOffice(null);
      setFormData({
        name: "",
        lat: "",
        lng: "",
        radius: "100",
        is_active: true,
        address: "",
        max_checkin_distance: "0",
        timezone: "Asia/Jakarta",
      });
    }
    setShowModal(true);
    setError("");
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingOffice(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError("");

    try {
      // Validation with explicit base 10 parsing
      const lat = parseFloat(formData.lat);
      const lng = parseFloat(formData.lng);
      const radius = parseInt(formData.radius, 10); // Explicit base 10
      const maxCheckinDistance = parseInt(formData.max_checkin_distance, 10);

      console.log("🔍 PARSING INPUT:", {
        raw_lat: formData.lat,
        raw_lng: formData.lng,
        raw_radius: formData.radius,
        parsed_lat: lat,
        parsed_lng: lng,
        parsed_radius: radius,
      });

      if (isNaN(lat) || isNaN(lng)) {
        setError("Koordinat GPS tidak valid");
        setProcessing(false);
        return;
      }

      if (isNaN(radius)) {
        setError("Radius tidak valid. Harus berupa angka.");
        setProcessing(false);
        return;
      }

      if (lat < -90 || lat > 90) {
        setError("Latitude harus antara -90 dan 90");
        setProcessing(false);
        return;
      }

      if (lng < -180 || lng > 180) {
        setError("Longitude harus antara -180 dan 180");
        setProcessing(false);
        return;
      }

      if (radius < 10 || radius > 1000) {
        setError("Radius harus antara 10 dan 1000 meter");
        setProcessing(false);
        return;
      }

      // CRITICAL FIX: Ensure all values match PocketBase schema
      const data = {
        name: formData.name.trim(),
        lat: Number(lat),
        lng: Number(lng),
        radius: Number(radius), // Changed from radius_meter to radius
        is_active: Boolean(formData.is_active),
        address: formData.address.trim() || "",
        max_checkin_distance: Number(maxCheckinDistance),
        timezone: formData.timezone || "Asia/Jakarta",
      };

      console.log("📤 DATA TO SAVE:", data);
      console.log("📊 DATA TYPES:", {
        lat: typeof data.lat,
        lng: typeof data.lng,
        radius: typeof data.radius,
        is_active: typeof data.is_active,
      });

      let savedRecord;
      if (editingOffice) {
        // Update
        savedRecord = await pb.collection("offices").update(editingOffice.id, data);
        console.log("✅ UPDATED - Response:", savedRecord);
      } else {
        // Create
        savedRecord = await pb.collection("offices").create(data);
        console.log("✅ CREATED - Response:", savedRecord);
      }

      // Verify saved by fetching the specific record
      const verifyRecord = await pb.collection("offices").getOne(savedRecord.id);
      console.log("🔍 VERIFICATION - DB has:", {
        id: verifyRecord.id,
        name: verifyRecord.name,
        radius: verifyRecord.radius,
        type: typeof verifyRecord.radius,
      });

      // Force refresh ALL offices data with cache bust
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 200));
      await fetchOffices();
      
      handleCloseModal();
      
      // Show success message
      alert(editingOffice ? "Kantor berhasil diupdate!" : "Kantor berhasil ditambahkan!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan kantor");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus kantor ini?")) return;

    try {
      await pb.collection("offices").delete(id);
      await fetchOffices();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus kantor");
    }
  };

  const handleToggleActive = async (office: Office) => {
    try {
      await pb.collection("offices").update(office.id, {
        is_active: !office.is_active,
      });
      
      // Force refresh
      await fetchOffices();
      alert("Status kantor berhasil diubah!");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal update status");
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Guard: Only HR & Owner
  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          ❌ Akses ditolak. Halaman ini hanya untuk HR dan Owner.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Pengaturan GPS Kantor</h1>
          <p className="text-slate-500 mt-1">Kelola lokasi kantor untuk validasi absensi</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Tambah Kantor
        </button>
      </div>

      {/* INFO BOX */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="font-medium text-blue-900 mb-2">📍 Cara Mendapatkan Koordinat GPS:</p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
          <li>Buka Google Maps</li>
          <li>Klik kanan pada lokasi kantor → &quot;What&apos;s here?&quot;</li>
          <li>Copy koordinat (contoh: -6.200000, 106.816666)</li>
          <li>Paste di form di bawah</li>
        </ol>
      </div>

      {/* OFFICES LIST */}
      {offices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <p className="text-lg font-medium text-slate-800">Belum ada kantor</p>
          <p className="text-sm text-slate-500 mt-1">Tambahkan kantor pertama untuk mulai validasi GPS</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offices.map((office) => (
            <div
              key={office.id}
              className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition"
            >
              {/* HEADER */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <MapPin className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{office.name}</h3>
                    {office.is_active ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Aktif
                      </span>
                    ) : (
                      <span className="text-xs text-red-600 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Nonaktif
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* GPS INFO */}
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Latitude:</span>
                  <span className="font-mono text-slate-800">{(office.lat || 0).toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Longitude:</span>
                  <span className="font-mono text-slate-800">{(office.lng || 0).toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Radius:</span>
                  <span className="font-semibold text-indigo-600">{office.radius || 100}m</span>
                </div>
                {office.address && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-500 text-xs">Alamat:</span>
                    <p className="text-slate-700 text-xs mt-1">{office.address}</p>
                  </div>
                )}
              </div>

              {/* GOOGLE MAPS LINK */}
              <a
                href={`https://www.google.com/maps?q=${office.lat},${office.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-3 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs text-center text-slate-600 transition"
              >
                📍 Buka di Google Maps
              </a>

              {/* ACTIONS */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleActive(office)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    office.is_active
                      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                      : "bg-green-100 text-green-700 hover:bg-green-200"
                  }`}
                >
                  {office.is_active ? "Nonaktifkan" : "Aktifkan"}
                </button>
                <button
                  onClick={() => handleOpenModal(office)}
                  className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {isOwner && (
                  <button
                    onClick={() => handleDelete(office.id)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-slate-800">
              {editingOffice ? "Edit Kantor" : "Tambah Kantor Baru"}
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* NAME */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Kantor *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Head Office"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* ADDRESS */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Alamat
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Jl. Contoh No. 123, Jakarta"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  rows={2}
                />
              </div>

              {/* LATITUDE */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Latitude *
                </label>
                <input
                  type="text"
                  value={formData.lat}
                  onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                  placeholder="-6.200000"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Contoh: -6.200000 (untuk Jakarta)</p>
              </div>

              {/* LONGITUDE */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Longitude *
                </label>
                <input
                  type="text"
                  value={formData.lng}
                  onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                  placeholder="106.816666"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Contoh: 106.816666 (untuk Jakarta)</p>
              </div>

              {/* RADIUS */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Radius (meter) *
                </label>
                <input
                  type="number"
                  value={formData.radius}
                  onChange={(e) => setFormData({ ...formData, radius: e.target.value })}
                  min="10"
                  max="1000"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Karyawan hanya bisa check-in dalam radius ini (10-1000 meter)
                </p>
              </div>

              {/* MAX CHECKIN DISTANCE */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Max Check-in Distance (meter)
                </label>
                <input
                  type="number"
                  value={formData.max_checkin_distance}
                  onChange={(e) => setFormData({ ...formData, max_checkin_distance: e.target.value })}
                  min="0"
                  max="1000"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  0 = mengikuti radius utama
                </p>
              </div>

              {/* TIMEZONE */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Timezone
                </label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                </select>
              </div>

              {/* IS ACTIVE */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
                  Aktifkan kantor ini
                </label>
              </div>

              {/* BUTTONS */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                  disabled={processing}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
