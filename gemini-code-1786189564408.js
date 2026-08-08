"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const STATUS_OPTIONS = [
  { value: "not_contacted", label: "ยังไม่ติดต่อ", color: "#8A836F", bg: "#EFEBDD" },
  { value: "contacted", label: "ติดต่อแล้ว", color: "#8A6D1F", bg: "#F5EAC7" },
  { value: "scheduled", label: "นัดชำระ", color: "#2B5C8A", bg: "#DCEBF7" },
  { value: "paid", label: "ชำระแล้ว", color: "#2F6B3C", bg: "#DFF0E1" },
];

function statusMeta(value) {
  return STATUS_OPTIONS.find((s) => s.value === value) || STATUS_OPTIONS[0];
}

function emptyForm() {
  return { name: "", phone: "", amount: "", status: "not_contacted" };
}

function formatCurrency(v) {
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("th-TH");
}

export default function DebtTracker() {
  const [view, setView] = useState("list");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [logText, setLogText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("debtors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(true);
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = "จำเป็นต้องกรอก";
    if (!form.phone.trim()) errs.phone = "จำเป็นต้องกรอก";
    if (!form.amount || isNaN(Number(form.amount))) errs.amount = "กรอกตัวเลขยอดเงิน";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const { error } = await supabase.from("debtors").insert({
      name: form.name.trim(),
      phone: form.phone.trim(),
      amount: Number(form.amount),
      status: form.status,
      logs: [],
      image_urls: []
    });
    if (error) {
      setErrors({ _global: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } else {
      setForm(emptyForm());
      await loadEntries();
      setView("list");
    }
    setSaving(false);
  }

  async function updateStatus(entry, newStatus) {
    const { error } = await supabase
      .from("debtors")
      .update({ status: newStatus })
      .eq("id", entry.id);
    if (!error) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: newStatus } : e))
      );
    }
  }

  async function addLog(entry) {
    if (!logText.trim()) return;
    const newLog = { text: logText.trim(), date: Date.now() };
    const updatedLogs = [newLog, ...(entry.logs || [])];
    const { error } = await supabase
      .from("debtors")
      .update({ logs: updatedLogs })
      .eq("id", entry.id);
    if (!error) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, logs: updatedLogs } : e))
      );
      setLogText("");
    }
  }

  // ระบบอัปโหลดไฟล์รูปภาพ
  async function handleImageUpload(e, entryId, currentImages) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;

      // 1. นำไฟล์ขึ้นไปเก็บบน Supabase Storage ในกล่อง images
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. ขอลิงก์รูปภาพแบบสาธารณะ
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);
      const newImageUrl = data.publicUrl;

      // 3. นำลิงก์รูปใหม่ ไปต่อท้ายรูปล่าสุด แล้วเซฟลงฐานข้อมูล
      const updatedImages = [...(currentImages || []), newImageUrl];
      const { error: dbError } = await supabase
        .from('debtors')
        .update({ image_urls: updatedImages })
        .eq('id', entryId);

      if (dbError) throw dbError;

      // 4. อัปเดตหน้าจอทันที
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, image_urls: updatedImages } : e))
      );
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  const activeEntry = entries.find((e) => e.id === activeId);
  const filteredEntries =
    statusFilter === "all" ? entries : entries.filter((e) => e.status === statusFilter);

  const totalOutstanding = entries
    .filter((e) => e.status !== "paid")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div style={styles.page}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
        input::placeholder, textarea::placeholder { color: #9C9284; }
        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: #2B5C8A;
          box-shadow: 0 0 0 3px rgba(43,92,138,0.15);
        }
        button:focus-visible { outline: 2px solid #2B5C8A; outline-offset: 2px; }
        .entry-row:hover { background: #F3F0E4; }
      `}</style>

      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>ระบบติดตามลูกหนี้</h1>
          <div style={styles.summaryRow}>
            <div style={styles.summaryBox}>
              <div style={styles.summaryLabel}>รายการทั้งหมด</div>
              <div style={styles.summaryValue}>{entries.length}</div>
            </div>
            <div style={styles.summaryBox}>
              <div style={styles.summaryLabel}>ยอดค้างรวม</div>
              <div style={styles.summaryValue}>฿{formatCurrency(totalOutstanding)}</div>
            </div>
          </div>
        </div>

        {view !== "add" && (
          <div style={styles.toolbar}>
            <div style={styles.filterRow}>
              <button
                onClick={() => setStatusFilter("all")}
                style={{
                  ...styles.filterChip,
                  ...(statusFilter === "all" ? styles.filterChipActive : {}),
                }}
              >
                ทั้งหมด
              </button>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatusFilter(s.value)}
                  style={{
                    ...styles.filterChip,
                    ...(statusFilter === s.value
                      ? { ...styles.filterChipActive, borderColor: s.color, color: s.color }
                      : {}),
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setForm(emptyForm());
                setErrors({});
                setView("add");
              }}
              style={styles.addBtn}
            >
              + เพิ่มรายการ
            </button>
          </div>
        )}

        {view === "list" && (
          <div style={styles.list}>
            {loading && <div style={styles.emptyState}>กำลังโหลดข้อมูล...</div>}
            {!loading && loadError && (
              <div style={styles.emptyState}>
                โหลดข้อมูลไม่สำเร็จ ตรวจสอบว่าตั้งค่า Supabase ถูกต้องหรือยัง{" "}
                <button onClick={loadEntries} style={styles.retryBtn}>ลองใหม่</button>
              </div>
            )}
            {!loading && !loadError && filteredEntries.length === 0 && (
              <div style={styles.emptyState}>ยังไม่มีรายการ เริ่มเพิ่มรายการแรกได้เลย</div>
            )}
            {!loading &&
              filteredEntries.map((e) => {
                const meta = statusMeta(e.status);
                return (
                  <div
                    key={e.id}
                    className="entry-row"
                    style={styles.entryRow}
                    onClick={() => {
                      setActiveId(e.id);
                      setView("detail");
                    }}
                  >
                    <div style={styles.entryMain}>
                      <div style={styles.entryName}>{e.name}</div>
                      <div style={styles.entryPhone}>{e.phone}</div>
                    </div>
                    <div style={styles.entryRight}>
                      <div style={styles.entryAmount}>฿{formatCurrency(e.amount)}</div>
                      <span
                        style={{
                          ...styles.statusPill,
                          color: meta.color,
                          background: meta.bg,
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {view === "add" && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>ชื่อ / รหัสอ้างอิงลูกค้า *</label>
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="เช่น ชื่อ หรือรหัสลูกค้า"
                style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
              />
              {errors.name && <div style={styles.errorText}>{errors.name}</div>}
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>เบอร์โทรศัพท์ *</label>
              <input
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="0xxxxxxxxx"
                style={{ ...styles.input, ...(errors.phone ? styles.inputError : {}) }}
              />
              {errors.phone && <div style={styles.errorText}>{errors.phone}</div>}
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>ยอดค้างชำระ (บาท) *</label>
              <input
                value={form.amount}
                onChange={(e) => updateField("amount", e.target.value)}
                placeholder="10000"
                inputMode="numeric"
                style={{ ...styles.input, ...(errors.amount ? styles.inputError : {}) }}
              />
              {errors.amount && <div style={styles.errorText}>{errors.amount}</div>}
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>สถานะ</label>
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                style={styles.input}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {errors._global && <div style={styles.errorText}>{errors._global}</div>}

            <div style={styles.formActions}>
              <button type="button" onClick={() => setView("list")} style={styles.cancelBtn}>
                ยกเลิก
              </button>
              <button type="submit" disabled={saving} style={styles.submitBtn}>
                {saving ? "กำลังบันทึก..." : "บันทึกรายการ"}
              </button>
            </div>
          </form>
        )}

        {view === "detail" && activeEntry && (
          <div style={styles.detail}>
            <button
              onClick={() => {
                setView("list");
                setActiveId(null);
                setLogText("");
              }}
              style={styles.backBtn}
            >
              ← กลับ
            </button>

            <div style={styles.detailHeader}>
              <div style={styles.detailName}>{activeEntry.name}</div>
              <div style={styles.detailPhone}>{activeEntry.phone}</div>
              <div style={styles.detailAmount}>฿{formatCurrency(activeEntry.amount)}</div>
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>สถานะ</label>
              <select
                value={activeEntry.status}
                onChange={(e) => updateStatus(activeEntry, e.target.value)}
                style={styles.input}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ส่วนจัดเก็บรูปภาพหลักฐาน */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>รูปภาพหลักฐาน (สลิป/เอกสาร)</label>
              
              {/* แสดงรูปภาพที่มีอยู่แล้ว */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {(activeEntry.image_urls || []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img 
                      src={url} 
                      alt={`หลักฐานที่ ${i + 1}`} 
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${LINE}` }} 
                    />
                  </a>
                ))}
              </div>

              {/* ปุ่มอัปโหลดรูปภาพ */}
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => handleImageUpload(e, activeEntry.id, activeEntry.image_urls)}
                disabled={uploading}
                style={{ fontSize: '13px', marginTop: '4px' }}
              />
              {uploading && <div style={{ fontSize: '12px', color: BLUE, marginTop: '4px' }}>กำลังอัปโหลดรูปภาพ...</div>}
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>เพิ่มบันทึกการติดตามผล</label>
              <div style={styles.logInputRow}>
                <input
                  value={logText}
                  onChange={(e) => setLogText(e.target.value)}
                  placeholder="เช่น โทรแล้วไม่รับสาย"
                  style={{ ...styles.input, flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLog(activeEntry);
                    }
                  }}
                />
                <button onClick={() => addLog(activeEntry)} style={styles.logAddBtn}>
                  เพิ่ม
                </button>
              </div>
            </div>

            <div style={styles.logList}>
              {(activeEntry.logs || []).length === 0 && (
                <div style={styles.emptyState}>ยังไม่มีบันทึกการติดตามผล</div>
              )}
              {(activeEntry.logs || []).map((log, i) => (
                <div key={i} style={styles.logItem}>
                  <div style={styles.logDate}>
                    {new Date(log.date).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div style={styles.logText}>{log.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p style={styles.footnote}>
        ข้อมูลนี้เก็บไว้บน Supabase — ทุกคนที่เปิดลิงก์นี้เห็นและแก้ไขรายการเดียวกันได้
      </p>
    </div>
  );
}

const INK = "#22301F";
const PAPER = "#F1EEE3";
const LINE = "#D8D2BF";
const BLUE = "#2B5C8A";

const styles = {
  page: {
    minHeight: "100vh",
    background: PAPER,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    fontFamily: "'Helvetica Neue', Arial, 'Noto Sans Thai', sans-serif",
    color: INK,
  },
  card: {
    width: "100%",
    maxWidth: 620,
    background: "#FBF9F2",
    border: `1px solid ${LINE}`,
    borderRadius: 6,
    boxShadow: "0 2px 0 rgba(34,48,31,0.06), 0 12px 24px rgba(34,48,31,0.08)",
    overflow: "hidden",
  },
  header: { padding: "24px 24px 18px", borderBottom: `1px solid ${LINE}` },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  summaryRow: { display: "flex", gap: 12, marginTop: 14 },
  summaryBox: {
    flex: 1,
    background: "#FFFFFC",
    border: `1px solid ${LINE}`,
    borderRadius: 4,
    padding: "10px 14px",
  },
  summaryLabel: { fontSize: 11, color: "#8A836F" },
  summaryValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  toolbar: {
    padding: "14px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    borderBottom: `1px solid ${LINE}`,
  },
  filterRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  filterChip: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${LINE}`,
    background: "transparent",
    color: "#8A836F",
    cursor: "pointer",
  },
  filterChipActive: { borderColor: INK, color: INK, fontWeight: 600 },
  addBtn: {
    padding: "8px 14px",
    background: BLUE,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  list: { maxHeight: 480, overflowY: "auto" },
  entryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 24px",
    borderBottom: `1px solid ${LINE}`,
    cursor: "pointer",
    transition: "background 0.1s",
  },
  entryMain: {},
  entryName: { fontWeight: 600, fontSize: 14 },
  entryPhone: { fontSize: 12, color: "#8A836F", marginTop: 2 },
  entryRight: { display: "flex", alignItems: "center", gap: 10 },
  entryAmount: { fontSize: 14, fontWeight: 600 },
  statusPill: { fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999 },
  emptyState: { textAlign: "center", fontSize: 13, color: "#8A836F", padding: "32px 8px" },
  retryBtn: {
    background: "none",
    border: "none",
    color: BLUE,
    textDecoration: "underline",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
  },
  form: { padding: 24, display: "flex", flexDirection: "column", gap: 14 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6, marginTop: 10 },
  label: { fontSize: 13, fontWeight: 600, color: "#4A4636" },
  input: {
    fontSize: 14,
    padding: "10px 12px",
    border: `1px solid ${LINE}`,
    borderRadius: 4,
    background: "#FFFFFC",
    color: INK,
    fontFamily: "inherit",
  },
  inputError: { borderColor: "#A5522A" },
  errorText: { fontSize: 12, color: "#A5522A" },
  formActions: { display: "flex", gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    padding: "11px 16px",
    background: "transparent",
    border: `1px solid ${LINE}`,
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    color: "#5B5646",
    cursor: "pointer",
  },
  submitBtn: {
    flex: 2,
    padding: "11px 16px",
    background: BLUE,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  detail: { padding: 24, display: "flex", flexDirection: "column", gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    color: "#8A836F",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  detailHeader: { borderBottom: `1px dashed ${LINE}`, paddingBottom: 14 },
  detailName: { fontSize: 18, fontWeight: 700 },
  detailPhone: { fontSize: 13, color: "#8A836F", marginTop: 2 },
  detailAmount: { fontSize: 20, fontWeight: 700, marginTop: 8, color: BLUE },
  logInputRow: { display: "flex", gap: 8 },
  logAddBtn: {
    padding: "10px 16px",
    background: INK,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  logList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" },
  logItem: {
    border: `1px solid ${LINE}`,
    borderRadius: 4,
    padding: "10px 12px",
    background: "#FFFFFC",
  },
  logDate: { fontSize: 11, color: "#9C9284" },
  logText: { fontSize: 13, marginTop: 3 },
  footnote: { marginTop: 16, fontSize: 11, color: "#9C9284", maxWidth: 620, textAlign: "center" },
};