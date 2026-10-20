/**
 * =========================================================================================
 * File: content.js
 * PCare BPJS Auto Filler - Ekstensi Google Chrome (Manifest V3)
 * Modul 1: Otomasi Pendaftaran Pasien & Deteksi Pemindahan Sheet Otomatis
 * Modul 2: Otomasi Entri Kunjungan, Sinkronisasi Tanggal, Input Hasil Lab, & Highlight Selesai
 * =========================================================================================
 */

// 1. URL Web App Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwBsijrDMHoo5MG24qaLqdggrSmYyRbXzobCetaODKKYOhssZfT9e8xk9uGcrAll7eofg/exec"
// Helper delay alias
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 2. Sembunyikan Notifikasi Kuning 'Verifikasi keamanan gagal' / toast warning:
 * Menginjeksi elemen <style> yang memaksa toast warning bawaan PCare menjadi display: none
 */
function hidePcareWarnings() {
  const style = document.createElement('style');
  style.innerHTML = `
    #toast-container > .toast-warning {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;
  if (document.documentElement) {
    document.documentElement.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.documentElement) document.documentElement.appendChild(style);
    });
  }
}
hidePcareWarnings(); // Panggil saat script dimuat

/**
 * Cek visibilitas elemen
 */
function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

/**
 * 1. Dinamis waitForElement (Menggantikan hard delay):
 * Menunggu elemen muncul di DOM dan visible menggunakan MutationObserver dan fallback setInterval
 * Mengembalikan elemen jika ditemukan, atau null jika timeout tercapai (tanpa reject agar loop tidak crash).
 */
function waitForElement(selector, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el && isElementVisible(el)) return resolve(el);

    let timer = null;
    let pollInterval = null;
    let observer = null;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
    };

    timer = setTimeout(() => {
      cleanup();
      resolve(null); // Return null instead of reject to prevent breaking the loop, let fallback handle it
    }, timeoutMs);

    observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found && isElementVisible(found)) {
        cleanup();
        resolve(found);
      }
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    pollInterval = setInterval(() => {
      const found = document.querySelector(selector);
      if (found && isElementVisible(found)) {
        cleanup();
        resolve(found);
      }
    }, 200);
  });
}

/**
 * 2. Penanganan Session Timeout (Auto-Logout PCare):
 * Memeriksa apakah sesi PCare telah berakhir atau dialihkan ke halaman login
 */
function isSessionExpired() {
  const url = window.location.href.toLowerCase();
  const hasLoginBox = Boolean(
    document.querySelector('input[name="username"], input[name="password"], #txtUsername, #txtPassword, #btnLogin, form[action*="login"]')
  );
  const isLoginPage = url.includes('/login') || url.includes('login.html') || url.includes('/auth') || url.includes('account/login');
  return isLoginPage || hasLoginBox;
}

/**
 * Helper khusus untuk mengisikan nilai lab ke form PCare:
 * Otomatis memfilter tanda bintang (*) dan spasi HANYA saat diisikan ke layar PCare,
 * TANPA mengubah atau merusak data asli di spreadsheet.
 */
function setLabInputValue(inputElement, rawValue) {
  if (!inputElement || rawValue === undefined || rawValue === null || rawValue === '') return;

  // Bersihkan bintang (*), ubah koma (,) desimal ke titik (.), lalu trim spasi
  const cleanValue = String(rawValue)
    .replace(/\*/g, '')
    .replace(/,/g, '.')
    .trim();

  inputElement.value = cleanValue;
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  inputElement.dispatchEvent(new Event('change', { bubbles: true }));
  if (window.jQuery && window.jQuery(inputElement).length) {
    try {
      window.jQuery(inputElement).val(cleanValue).trigger('change');
    } catch (e) { }
  }
}

// 2. Selektor HTML Modul 1 (Pendaftaran Pasien)
const SELECTORS_PENDAFTARAN = {
  txtTanggal: "#txttanggal",
  noKartu: "#txtpeserta, #nomor, #txtnokartu, #txtPencarian, input[name='txtpeserta'], input[placeholder*='Nomor' i]",
  txtPeserta: "#txtpeserta, #nomor, #txtnokartu, #txtPencarian, input[name='txtpeserta'], input[placeholder*='Nomor' i]",
  btnCari: "#btnCariPeserta, #btnCari, button[onclick*='Cari' i], button i.fa-search, .btn-search, #nomor ~ button, #txtpeserta ~ button",
  namaPeserta: "#namaPeserta, #lblNamaPeserta, #nama, .nama-peserta",
  tkpPromotif: "#tkp50",
  poli: "#poli",
  keluhan: "#keluhan",
  tb: "#tinggiBadan",
  bb: "#beratBadan",
  lp: "#lingkarPerut",
  sistole: "#sistole",
  diastole: "#diastole",
  respRate: "#respRate",
  heartRate: "#heartRate",
  btnSimpan: "#btnSimpanPendaftaran, #btnSimpan, #btn_simpan, button[id*='Simpan' i], button[onclick*='simpan' i], button.btn-success"
};

// 3. Selektor HTML Modul 2 (Entri Kunjungan & Input Hasil Lab)
const SELECTORS_KUNJUNGAN = {
  txtTanggal: "#txttanggal",
  rbKartu: "#rbkartu",
  poli: "#poli",
  nomor: "#nomor",
  keluhan: "#keluhan",
  anamnesa: "#anamnesa_txt",
  jamKunjungan: "#jamKunjungan_time",
  alergiMakanChk: "#alergiMakan_chk",
  alergiUdaraChk: "#alergiUdara_chk",
  alergiObatChk: "#alergiObat_chk",
  alergiMakanSlc: "#alergiMakan_slc",
  alergiUdaraSlc: "#alergiUdara_slc",
  alergiObatSlc: "#alergiObat_slc",
  prognosa: "#prognosa_slc",
  diagnosa: "#kddiagnosa1",
  kesadaran: "#kesadaran",
  suhu: "#suhu_txt",
  tb: "#tinggiBadan",
  bb: "#beratBadan",
  lp: "#lingkarPerut",
  sistole: "#sistole",
  diastole: "#diastole",
  respRate: "#respRate",
  heartRate: "#heartRate",
  statusPulang: "#statuspulang",
  terapiObat: "#terapiMedikamentosa_txt",
  terapiNonObat: "#terapiNonMedikamentosa_txt",
  bmhp: "#BMHP_txt",
  dokter: "#tenagamedis",
  tenagaMedis: "#tenagamedis",
  pelayanan: "#listNonKapitasi_slc",
  listNonKapitasi: "#listNonKapitasi_slc",
  btnSimpan: "#btnSimpan",
  tabTindakan: "#tab_0",
  // Sub-tab & Form Pelayanan Non Kapitasi
  tabGulaDarah: "#tabDet_10",
  tabHbA1c: "#tabDet_11",
  tabKimiaDarah: "#tabDet_12",
  btnTambahGulaDarah: "#tambahPelayananGulaDarah_btn",
  btnTambahKimiaDarah: "#tambahPelayananKimiaDarah_btn",
  cbPemeriksaanDarah: "#cb_jns_pemeriksaan_darah",
  cbPelayananKimia: "#jnsPelayanan_slc",
  hasilTxt: "#hasil_txt",
  btnSimpanItem: "#simpan_btn"
};

// State untuk mencegah eksekusi ganda jika tombol ekstensi diklik berulang kali
let isProcessing = false;

/**
 * =========================================================================================
 * LISTENER KOMUNIKASI DARI POPUP
 * =========================================================================================
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (isProcessing) {
    showNotification("Proses otomasi sedang berjalan, mohon tunggu...", "warning");
    sendResponse({ success: false, message: "Proses otomasi sedang berjalan..." });
    return true;
  }

  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.trim() === "") {
    const errorMsg = "URL Google Apps Script belum diisi di content.js!";
    showNotification(errorMsg, "error");
    alert("[PERINGATAN] " + errorMsg);
    sendResponse({ success: false, message: errorMsg });
    return true;
  }

  const action = request.action;
  const currentUrl = window.location.href;
  const limit = Number(request.limit) || 0;
  const limitLabel = limit > 0 ? ` [Limit: ${limit} Pasien]` : " [Semua Data]";
  const sheetTarget = request.sheetTarget || "PROLANIS";

  if (action === "START_INPUT_HASIL" || action === "START_ENTRI_KUNJUNGAN") {
    // Pemicu eksplisit Modul 2
    if (!currentUrl.includes("EntriKunjunganDokkel")) {
      const msg = "Peringatan: Anda belum berada di halaman Entri Kunjungan (/eclaim/EntriKunjunganDokkel).";
      showNotification(msg, "warning");
      alert("[PERINGATAN] " + msg);
      sendResponse({ success: false, message: msg });
      return true;
    }
    const filterTgl = request.tgl ? String(request.tgl).trim() : "";
    const searchMode = request.searchMode || "kartu";
    showNotification(`Memulai Otomasi Entri Kunjungan (${sheetTarget})... Mengambil data spreadsheet...`, "info");
    runEntriKunjunganProcess(filterTgl, searchMode, limit, sheetTarget);
    sendResponse({ success: true, message: `Otomasi Entri Kunjungan dimulai (Target: ${sheetTarget}, Mode: ${searchMode === 'antrian' ? 'No. Antrian' : 'No. Kartu BPJS'}${filterTgl ? `, Filter: ${filterTgl}` : ""}${limitLabel})!` });
    return true;

  } else if (action === "START_PENDAFTARAN") {
    // Pemicu eksplisit Modul 1
    const filterTgl = request.tgl ? String(request.tgl).trim() : "";
    showNotification(`Memulai Otomasi Pendaftaran Pasien (${sheetTarget})... Mengambil data spreadsheet...`, "info");
    runAutoFillProcess(filterTgl, limit, sheetTarget);
    sendResponse({ success: true, message: `Otomasi Pendaftaran Pasien dimulai (Target: ${sheetTarget}${filterTgl ? `, Tanggal: ${filterTgl}` : ""}${limitLabel})!` });
    return true;

  } else if (action === "START_AUTO_FILL") {
    // Smart Router: Jika sedang di halaman EntriKunjunganDokkel, jalankan Modul 2. Jika di pendaftaran, jalankan Modul 1.
    const filterTgl = request.tgl ? String(request.tgl).trim() : "";
    const searchMode = request.searchMode || "kartu";
    if (currentUrl.includes("EntriKunjunganDokkel")) {
      showNotification(`Memulai Otomasi Entri Kunjungan (${sheetTarget})... Mengambil data spreadsheet...`, "info");
      runEntriKunjunganProcess(filterTgl, searchMode, limit, sheetTarget);
      sendResponse({ success: true, message: `Mendeteksi halaman Entri Kunjungan: Otomasi Hasil Lab dimulai (Target: ${sheetTarget}, Mode: ${searchMode === 'antrian' ? 'No. Antrian' : 'No. Kartu BPJS'}${filterTgl ? `, Filter: ${filterTgl}` : ""}${limitLabel})!` });
    } else {
      showNotification(`Memulai Otomasi Pendaftaran Pasien (${sheetTarget})... Mengambil data spreadsheet...`, "info");
      runAutoFillProcess(filterTgl, limit, sheetTarget);
      sendResponse({ success: true, message: `Otomasi Pendaftaran Pasien dimulai (Target: ${sheetTarget}${filterTgl ? `, Tanggal: ${filterTgl}` : ""}${limitLabel})!` });
    }
    return true;
  }

  sendResponse({ success: false, message: `Aksi '${action}' tidak dikenali.` });
  return true;
});


/**
 * =========================================================================================
 * HELPER FORMAT TANGGAL & EKSTRAKSI DATA LAB
 * =========================================================================================
 */

/**
 * Mengonversi string tanggal pendaftaran dari Sheets ke format standar PCare DD-MM-YYYY (misal: 02-09-2026)
 * Mendukung format teks bulan Indonesia ("9 September 2026"), format ISO ("2026-09-02"), slash ("02/09/2026"), dsb.
 */
function convertToDDMMYYYY(dateStr) {
  if (!dateStr || String(dateStr).trim() === "") {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const y = now.getFullYear();
    return `${d}-${m}-${y}`;
  }

  const str = String(dateStr).trim();

  // 1. Format Indonesia: misal "9 September 2026" atau "02 September 2026"
  const indonesianMonths = {
    januari: "01", februari: "02", maret: "03", april: "04", mei: "05", juni: "06",
    juli: "07", agustus: "08", september: "09", oktober: "10", november: "11", desember: "12",
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  const regexIndo = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/;
  const matchIndo = str.match(regexIndo);
  if (matchIndo) {
    const day = matchIndo[1].padStart(2, "0");
    const monthName = matchIndo[2].toLowerCase();
    const month = indonesianMonths[monthName] || "01";
    const year = matchIndo[3];
    return `${day}-${month}-${year}`;
  }

  // 2. Format "DD-MM-YYYY" atau "DD/MM/YYYY"
  const regexDDMM = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const matchDDMM = str.match(regexDDMM);
  if (matchDDMM) {
    const day = matchDDMM[1].padStart(2, "0");
    const month = matchDDMM[2].padStart(2, "0");
    const year = matchDDMM[3];
    return `${day}-${month}-${year}`;
  }

  // 3. Format ISO "YYYY-MM-DD"
  const regexISO = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
  const matchISO = str.match(regexISO);
  if (matchISO) {
    const year = matchISO[1];
    const month = matchISO[2].padStart(2, "0");
    const day = matchISO[3].padStart(2, "0");
    return `${day}-${month}-${year}`;
  }

  // 4. Standar Date Object parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, "0");
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const y = parsed.getFullYear();
    return `${d}-${m}-${y}`;
  }

  // Fallback: Hari ini
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Helper: Menambahkan sejumlah hari ke string tanggal dengan penanganan akhir bulan / rollover akurat
 * Mendukung format input teks Indonesia ("12 Oktober 2026") maupun DD-MM-YYYY ("12-10-2026")
 * Mengembalikan string dalam format DD-MM-YYYY
 */
function addDaysToDateString(val, days = 1) {
  if (!val) return "";
  const std = convertToDDMMYYYY(val);
  const parts = std.split("-");
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) {
      dateObj.setDate(dateObj.getDate() + days);
      // Jika jatuh pada hari MINGGU (getDay() === 0), lewati hari libur faskes ke hari SENIN
      if (dateObj.getDay() === 0) {
        dateObj.setDate(dateObj.getDate() + 1);
      }
      const resD = String(dateObj.getDate()).padStart(2, "0");
      const resM = String(dateObj.getMonth() + 1).padStart(2, "0");
      const resY = dateObj.getFullYear();
      return `${resD}-${resM}-${resY}`;
    }
  }
  return std;
}

/**
 * Mencari nilai dalam objek dictionary berdasarkan kecocokan nama properti
 */
function findInDict(obj, keywords) {
  if (!obj || typeof obj !== "object") return "";
  const keys = Object.keys(obj);
  for (const k of keys) {
    const lower = k.toLowerCase().trim();
    for (const kw of keywords) {
      if (lower === kw.toLowerCase() || lower.includes(kw.toLowerCase())) {
        const val = obj[k];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
    }
  }
  return "";
}

/**
 * Helper: Validasi angka hasil lab secara ketat (mencegah nilai 'false', 'Baru', 'Promotif Preventif', dll)
 */
function isValidLabNumber(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'false' || str.toLowerCase() === 'true' || str.toLowerCase() === 'baru') return false;
  // Loloskan angka murni atau angka dengan format desimal titik/koma serta simbol < / >
  return /^[<>]?\s*\d+([.,]\d+)?\s*(\*)?$/.test(str);
}

/**
 * Ekstraksi terpusat dan normalisasi data hasil laboratorium dari record pasien
 * Pemetaan Wajib Kolom Spreadsheet (0-based atau nama properti):
 * - Kimia Darah (Wajib Kolom R s/d X saja):
 *   Kolom R (17): CHO (Kolesterol Total)
 *   Kolom S (18): TG (Trigliserida)
 * - Kimia Darah (Kolom N s/d T):
 *   Kolom N (13): CHO (Kolesterol Total)
 *   Kolom O (14): TG (Trigliserida)
 *   Kolom P (15): HDL (Kolesterol HDL)
 *   Kolom Q (16): LDL (Kolesterol LDL)
 *   Kolom R (17): UR (Ureum)
 *   Kolom S (18): CRE (Kreatinin)
 *   Kolom T (19): MAU (Microalbuminuria)
 * - HbA1c:
 *   Kolom U (20): HbA1c
 * - Gula Darah:
 *   Kolom V (21): GDP (Gula Darah Puasa) -> kode 05049
 *   Kolom W (22): GDPP (Gula Darah 2 Jam PP) -> kode 05050
 *   Kolom X (23): GDS (Gula Darah Sewaktu) -> kode 05048
 */
function extractLabResults(patient) {
  const raw = patient.rawCols || {};
  const lr = patient.labResults || {};
  const kd = patient.kimiaDarah || {};
  const gd = patient.gulaDarah || {};

  function cleanLab(candidates) {
    for (const c of candidates) {
      if (isValidLabNumber(c)) {
        return String(c).trim();
      }
    }
    return "";
  }

  // Kimia Darah (Kolom N s/d T: CHO, TG, HDL, LDL, UR, CRE, MAU)
  const cho = cleanLab([lr.cho, raw.N, raw.CHO, patient.cho, findInDict(kd, ["cho", "kolesterol total", "cholesterol"])]);
  const tg = cleanLab([lr.tg, raw.O, raw.TG, patient.tg, findInDict(kd, ["tg", "trigliserida", "triglyceride"])]);
  const hdl = cleanLab([lr.hdl, raw.P, raw.HDL, patient.hdl, findInDict(kd, ["hdl", "kolesterol hdl"])]);
  const ldl = cleanLab([lr.ldl, raw.Q, raw.LDL, patient.ldl, findInDict(kd, ["ldl", "kolesterol ldl"])]);
  const ur = cleanLab([lr.ur, raw.R, raw.UR, patient.ur, findInDict(kd, ["ur", "ureum", "urea"])]);
  const cre = cleanLab([lr.cre, raw.S, raw.CRE, patient.cre, findInDict(kd, ["cre", "creatinin", "kreatinin"])]);
  const mau = cleanLab([lr.mau, raw.T, raw.MAU, patient.mau, findInDict(kd, ["mau", "micro albuminuria", "albuminuria"])]);

  // HbA1c (Kolom U / 20)
  const hba1c = cleanLab([lr.hba1c, raw.U, raw.HBA1C, patient.hba1c, findInDict(patient, ["hba1c", "hb a1c", "a1c"])]);

  // Gula Darah (Kolom V, W, X: GDP, GDPP, GDS)
  const gdp = cleanLab([lr.gdp, raw.V, raw.GDP, patient.gdp, findInDict(gd, ["gdp", "puasa", "05049"])]);
  const gdpp = cleanLab([lr.gdpp, raw.W, raw.GDPP, patient.gdpp, findInDict(gd, ["gdpp", "2 jam pp", "05050"])]);
  const gds = cleanLab([lr.gds, raw.X, raw.GDS, patient.gds, findInDict(gd, ["gds", "sewaktu", "05048"])]);

  return {
    cho, tg, hdl, ldl, ur, cre, mau,
    hba1c,
    gdp, gdpp, gds
  };
}

/**
 * Memeriksa apakah pasien memiliki minimal 1 hasil tes laboratorium yang terisi angka valid
 */
function hasLabData(patient) {
  const lab = extractLabResults(patient);
  const hasBloodLab = Boolean(
    lab.cho || lab.tg || lab.hdl || lab.ldl || lab.ur || lab.cre || lab.mau ||
    lab.gdp || lab.gdpp || lab.gds ||
    lab.hba1c
  );
  if (hasBloodLab) return true;

  // Mendukung baris pasien dari tab Skrining DM dan Pap Smear
  const diagClean = String(patient.diagnosa || patient.rawCols?.AI || patient.rawCols?.Y || patient.rawCols?.Z || "").toLowerCase().replace(/\s+/g, "");
  if (diagClean === "z13.1" || diagClean === "z12.4") return true;

  const sheetUpper = String(patient.sheetName || "").toUpperCase();
  if (sheetUpper.includes("SKRINING") || sheetUpper.includes("PAP") || sheetUpper.includes("SMEAR")) return true;

  const paket = String(patient.pelayananNonKapitasi || patient.rawCols?.AO || patient.rawCols?.AP || "").toLowerCase();
  if (paket.includes("serviks") || paket.includes("papsmear") || paket.includes("skrining")) return true;

  return false;
}

/**
 * Mengirim sinyal POST ke Google Apps Script bahwa seluruh hasil lab pasien selesai diinput
 * Apps Script akan mewarnai baris pasien dengan warna merah muda/salem (#F4CCCC) dan mengisi Kolom TGL ENTRI
 */
async function markHasilSelesaiInSheets(rowNumber, noBpjs, sheetName, tglPly = "", tglHasil = "", effectiveDate = "") {
  if (!rowNumber) {
    console.warn("[PCare AutoFiller] [Modul 2] Gagal mark HASIL_SELESAI: rowNumber tidak tersedia.");
    return false;
  }

  const payload = {
    action: "HASIL_SELESAI",
    status: "HASIL_SELESAI",
    rowNumber: Number(rowNumber),
    noBpjs: String(noBpjs || ""),
    sheetName: String(sheetName || ""),
    tglPly: String(tglPly || ""),
    tglHasil: String(tglHasil || ""),
    effectiveDate: String(effectiveDate || ""),
    tanggal: String(effectiveDate || tglHasil || tglPly || "")
  };

  console.log(`[PCare AutoFiller] [Modul 2] Mengirim sinyal HASIL_SELESAI ke Apps Script (POST) Baris ${rowNumber}, BPJS: ${noBpjs}, TGL HASIL: ${tglHasil || '-'}, TGL PLY: ${tglPly || '-'}, EFFECTIVE: ${effectiveDate || '-'}...`);
  showNotification(`Menandai baris ${rowNumber} selesai lab (merah muda)...`, "info");

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error status: ${response.status}`);
    }

    try {
      const result = await response.json();
      console.log("[PCare AutoFiller] [Modul 2] Respon POST HASIL_SELESAI:", result);
    } catch (e) {
      console.log("[PCare AutoFiller] [Modul 2] Respon POST diterima.");
    }

    showNotification(`[SUKSES] Baris ${rowNumber} ditandai selesai lab di Sheets!`, "success");
    return true;

  } catch (err) {
    console.error(`[PCare AutoFiller] [Modul 2] Gagal mengirim sinyal HASIL_SELESAI untuk baris ${rowNumber}:`, err);
    showNotification(`[PERINGATAN] Gagal update status warna di Sheets: ${err.message}`, "warning");
    return false;
  }
}

/**
 * Mengirim request pemindahan baris pasien ke Google Apps Script (Aksi movePatientRow)
 * Parameter:
 * - rowIndex: nomor baris asal (1-based index)
 * - sourceSheetName: nama sheet asal (default: 'PROLANIS OKTOBER 2026')
 * - targetSheetName: sheet tujuan ('PAPSMEAR OKTOBER 2026', 'SKRINING DM OKTOBER 2026', atau 'KLAIM MUNDUR')
 * - reason: alasan penolakan / pesan error (opsional)
 * - noBpjs: nomor kartu BPJS pasien untuk verifikasi baris (opsional)
 * - noAntrean: nomor antrean pendaftaran yang diperoleh dari PCare (opsional)
 * - tanggal: tanggal pendaftaran / pelayanan (opsional)
 */
async function movePatientRowInSheets(rowIndex, sourceSheetName, targetSheetName, reason = "", noBpjs = "", noAntrean = "", tanggal = "") {
  if (!rowIndex) {
    console.warn("[PCare AutoFiller] Gagal movePatientRow: rowIndex tidak ada.");
    return false;
  }

  const payload = {
    action: "movePatientRow",
    rowIndex: Number(rowIndex),
    rowNumber: Number(rowIndex),
    sourceSheetName: String(sourceSheetName || "PROLANIS OKTOBER 2026"),
    targetSheetName: String(targetSheetName || ""),
    reason: String(reason || ""),
    noBpjs: String(noBpjs || ""),
    noAntrean: String(noAntrean || ""),
    tanggal: String(tanggal || "")
  };

  console.log(`[PCare AutoFiller] Memindahkan baris ${rowIndex} dari '${payload.sourceSheetName}' ke '${payload.targetSheetName}' (Alasan: ${reason || '-'}, BPJS: ${noBpjs || '-'}, Antrean: ${noAntrean || '-'}, Tgl: ${tanggal || '-'})`);

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error status: ${response.status}`);
    }

    const res = await response.json();
    console.log("[PCare AutoFiller] Respon movePatientRow:", res);
    return true;
  } catch (err) {
    console.error("[PCare AutoFiller] Gagal memindahkan baris:", err);
    return false;
  }
}


/**
 * Helper Pengunci Tanggal Agresif (Modul 2):
 * Mengunci tanggal kunjungan (#txttanggal) agar tidak ter-reset otomatis oleh sistem PCare ke hari ini
 */
async function enforceTanggalKunjungan(targetDateDDMMYYYY) {
  if (!targetDateDDMMYYYY) return;
  const el = document.querySelector(SELECTORS_KUNJUNGAN.txtTanggal) || document.querySelector('#txttanggal, input[name="txttanggal"]');
  if (el) {
    el.value = targetDateDDMMYYYY;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  if (typeof window !== "undefined" && window.jQuery) {
    try {
      const $txt = window.jQuery(el || '#txttanggal');
      if ($txt && $txt.length) {
        $txt.val(targetDateDDMMYYYY).trigger('change');
        if (typeof $txt.datepicker === 'function') {
          try { $txt.datepicker('setDate', targetDateDDMMYYYY); } catch (e) { }
          try { $txt.datepicker('update', targetDateDDMMYYYY); } catch (e) { }
        }
      }
    } catch (e) { }
  }

  if (el && el.value !== targetDateDDMMYYYY) {
    el.value = targetDateDDMMYYYY;
  }
}

/**
 * Helper: Mengklik tombol Batal pada form kunjungan agar isian sebelumnya bersih
 * Digunakan sebelum memproses antrean berikutnya agar PCare kembali ke status pencarian baru.
 */
async function clickBatalKunjungan() {
  console.log("[PCare AutoFiller] [Modul 2] Membersihkan form kunjungan dengan tombol Batal...");
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) { }
  await delay(200);

  // 1. Cari tombol Batal secara spesifik
  const btnBatal = document.querySelector("#btnBatal, #btn_batal, #btnReset, button[onclick*='batal' i], button[onclick*='reset' i]") ||
    Array.from(document.querySelectorAll("button, a.btn, a")).find(el => {
      const txt = (el.textContent || "").trim().toLowerCase();
      return txt === "batal" || txt === "reset";
    });

  if (btnBatal && isElementVisible(btnBatal)) {
    btnBatal.click();
    btnBatal.dispatchEvent(new Event("click", { bubbles: true }));
    console.log("[PCare AutoFiller] [Modul 2] Tombol Batal berhasil diklik.");
  }

  // 2. Beri jeda 800ms
  await delay(800);

  // 3. Pembersihan paksa manual via DOM jika field masih berisi
  try {
    const nomorEl = document.querySelector(SELECTORS_KUNJUNGAN.nomor) || document.querySelector("#nomor");
    if (nomorEl) {
      nomorEl.value = "";
      nomorEl.dispatchEvent(new Event("input", { bubbles: true }));
      nomorEl.dispatchEvent(new Event("change", { bubbles: true }));
      nomorEl.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    const noKartuLabels = document.querySelectorAll("#noKartu_lbl, #lblNoKartu, #noKartu, #lblNoPeserta");
    noKartuLabels.forEach(el => { el.innerText = ""; el.textContent = ""; });

    const namaLabels = document.querySelectorAll("#namaPeserta, #lblNamaPeserta, #nama, #lblNama");
    namaLabels.forEach(el => { el.innerText = ""; el.textContent = ""; });

    const keluhanEl = document.querySelector(SELECTORS_KUNJUNGAN.keluhan) || document.querySelector("#keluhan");
    if (keluhanEl) {
      keluhanEl.value = "";
      keluhanEl.dispatchEvent(new Event("input", { bubbles: true }));
      keluhanEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const anamnesaEl = document.querySelector(SELECTORS_KUNJUNGAN.anamnesa) || document.querySelector("#anamnesa_txt, #anamnesa");
    if (anamnesaEl) {
      anamnesaEl.value = "";
      anamnesaEl.dispatchEvent(new Event("input", { bubbles: true }));
      anamnesaEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (cleanErr) {
    console.warn("[PCare AutoFiller] [Modul 2] Peringatan saat pembersihan manual DOM:", cleanErr);
  }

  // 4. Beri jeda akhir 700ms agar PCare kembali ke kondisi siap input baru
  await delay(700);
}

/**
 * Helper: Mengunci jam kunjungan menjadi "07:00" pada seluruh input terkait jam di PCare
 */
async function enforceJamKunjungan(targetTime = "07:00") {
  const selectors = [
    "#jamKunjungan_time",
    "#jamkunjungan",
    "#txtjam",
    "input[id*='jam' i]",
    "input[name*='jam' i]"
  ];
  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    elements.forEach(el => {
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT")) {
        el.value = targetTime;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        if (window.jQuery && window.jQuery(el).length) {
          try {
            window.jQuery(el).val(targetTime).trigger("change");
          } catch (e) { }
        }
      }
    });
  }
}

/**
 * Helper: Mengekstrak No. Kunjungan aktif dari form atau tabel riwayat kunjungan PCare
 */
function extractNoKunjunganFromScreen(targetDateStr = "") {
  // 1. Cek elemen input / label no kunjungan di form utama
  const inputSelectors = [
    "#noKunjungan", "#txtNoKunjungan", "#txtnokunjungan",
    "input[name*='noKunjungan' i]", "input[id*='noKunjungan' i]",
    "#lblNoKunjungan", "#no_kunjungan"
  ];
  for (const sel of inputSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const val = (el.value || el.textContent || "").trim();
    if (val && val.length >= 10 && !val.toLowerCase().includes("baru") && !val.toLowerCase().includes("cari")) {
      return val;
    }
  }

  // 2. Cek baris tabel riwayat kunjungan peserta di bawah form
  const rows = document.querySelectorAll("table tbody tr");
  for (const row of rows) {
    const rowText = (row.textContent || "").trim();
    if (targetDateStr && !rowText.includes(targetDateStr)) continue;
    const cells = row.querySelectorAll("td");
    for (const cell of cells) {
      const cellTxt = (cell.textContent || "").trim();
      // Format no kunjungan PCare berupa kode >= 10 karakter (biasanya 19 digit angka/alfanumerik)
      if (/^[0-9A-Za-z]{10,25}$/.test(cellTxt) && !cellTxt.toLowerCase().includes("laboratorium")) {
        return cellTxt;
      }
    }
  }

  return "";
}

/**
 * Helper: Mendeteksi apakah pasien di halaman kunjungan adalah Prolanis murni atau Skrining DM
 * Hanya memeriksa elemen profil pendaftaran di panel kiri atas, mengabaikan panel informasi dan notifikasi ekstensi
 */
function checkIsProlanisInKunjungan(patient) {
  // 1. Cek indikasi dari data spreadsheet terlebih dahulu
  const diagClean = String(patient.diagnosa || patient.rawCols?.diagnosa || patient.rawCols?.AI || patient.rawCols?.Y || patient.rawCols?.Z || "").toLowerCase().replace(/\s+/g, "");
  const keluhanClean = String(patient.keluhan || patient.rawCols?.keluhan || patient.rawCols?.AD || patient.rawCols?.T || patient.rawCols?.U || "").toLowerCase();
  const pelClean = String(patient.pelayananNonKapitasi || patient.rawCols?.AO || patient.rawCols?.AP || "").toLowerCase();

  if (patient.isDuplicateSameDay === true) return false;
  if (diagClean === "z13.1" || diagClean === "z131") return false;
  if (keluhanClean.includes("skrining")) return false;
  if (pelClean.includes("skrining") || pelClean.includes("penapisan")) return false;

  // 2. Baca elemen profil pendaftaran di panel kiri atas PCare (HANYA elemen profil spesifik)
  const profileSelectors = [
    "#noKartu_lbl", "#lblNoKartu", "#statusPeserta", "#lblStatusPeserta",
    "#prolanis", "#prb", "#lblProlanis", "#lblPrb", ".badge-prolanis",
    "#pcare-patient-info", ".profile-user-info", "#divPeserta", "#dataPeserta"
  ];

  let profileText = "";
  for (const sel of profileSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    // Abaikan jika berada di dalam container notifikasi ekstensi
    if (el.closest && el.closest("#pcare-autofill-notif")) continue;
    // Abaikan panel informasi pemeriksaan terakhir peserta prolanis
    const panelTitle = el.closest(".panel")?.querySelector(".panel-heading, .panel-title")?.textContent || "";
    if (panelTitle.toLowerCase().includes("pemeriksaan terakhir") || panelTitle.toLowerCase().includes("riwayat")) continue;

    profileText += " " + (el.textContent || "");
  }

  // Jika belum dapat dari selector spesifik, cari di panel profil pendaftaran kiri (bukan panel riwayat)
  if (!profileText.trim()) {
    const leftPanels = document.querySelectorAll(".col-md-4 .panel, .col-sm-4 .panel, .panel-default");
    for (const panel of leftPanels) {
      const heading = panel.querySelector(".panel-heading, .panel-title")?.textContent || "";
      if (heading.toLowerCase().includes("pemeriksaan terakhir") || heading.toLowerCase().includes("riwayat")) {
        continue;
      }
      if (heading.toLowerCase().includes("peserta") || heading.toLowerCase().includes("pendaftaran") || panel.querySelector("#noKartu_lbl, #namaPeserta")) {
        profileText += " " + (panel.textContent || "");
      }
    }
  }

  const pTextUpper = profileText.toUpperCase();
  const hasProlanisWord = pTextUpper.includes("PROLANIS");
  const hasPrbWord = pTextUpper.includes("PRB");

  if (!hasProlanisWord && !hasPrbWord) {
    return false;
  }

  // Cek apakah pemeriksaan gula darah dan peserta hanya tertulis Prolanis HT tanpa DM
  const labGula = patient.labResults || extractLabResults(patient);
  const hasGulaLab = Boolean(
    labGula.gdp || labGula.gdpp || labGula.gds ||
    patient.rawCols?.V || patient.rawCols?.W || patient.rawCols?.X ||
    patient.rawCols?.GDP || patient.rawCols?.GDPP || patient.rawCols?.GDS
  );

  if (hasGulaLab) {
    const hasDmOrDiabetes = pTextUpper.includes("DM") || pTextUpper.includes("DIABETES");
    const hasHtOrHipertensi = pTextUpper.includes("HT") || pTextUpper.includes("HIPERTENSI");
    if (hasHtOrHipertensi && !hasDmOrDiabetes) {
      // Pasien terdaftar Prolanis HT saja, periksa gula darah adalah Skrining DM!
      return false;
    }
  }

  return true;
}

/**
 * =========================================================================================
 * MODUL 2: OTOMASI ENTRI KUNJUNGAN & INPUT HASIL LAB (/eclaim/EntriKunjunganDokkel)
 * =========================================================================================
 */

/**
 * Fungsi Utama Modul 2: Mengambil data dari Sheets, memfilter hasil lab, dan mengeksekusi kunjungan
 */
async function runEntriKunjunganProcess(filterTgl = "", searchMode = "kartu", limit = 0, sheetTarget = "PROLANIS") {
  isProcessing = true;
  const modeLabel = searchMode === "antrian" ? "No. Antrian" : "No. Kartu BPJS";
  const limitLabel = limit > 0 ? ` (Maks: ${limit} Pasien)` : "";
  showNotification(`Memulai Otomasi Entri Kunjungan (Target: ${sheetTarget}, ${modeLabel}${limitLabel})${filterTgl ? ` (Filter: ${filterTgl})` : ""}...`, "info");

  try {
    // Penanganan Session Timeout (Auto-Logout PCare)
    if (isSessionExpired()) {
      const sessionMsg = "Sesi login PCare telah berakhir / halaman login terdeteksi. Silakan login kembali ke PCare BPJS terlebih dahulu.";
      console.error(`[PCare AutoFiller] [Modul 2] [ERROR] ${sessionMsg}`);
      showNotification(`[ERROR] Sesi PCare Habis! Silakan login ulang.`, "error");
      alert(sessionMsg);
      return;
    }

    // 1. Validasi Halaman
    if (!window.location.href.includes("EntriKunjunganDokkel")) {
      throw new Error("Anda harus berada di halaman Entri Kunjungan (/eclaim/EntriKunjunganDokkel)!");
    }

    // 2. Fetch Data dari Google Sheets (dengan parameter action=getKunjungan & tgl & sheetTarget)
    let fetchUrl = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + "action=getKunjungan";
    if (sheetTarget) {
      fetchUrl += "&sheetTarget=" + encodeURIComponent(sheetTarget);
    }
    if (filterTgl && filterTgl.trim() !== "") {
      fetchUrl += "&tgl=" + encodeURIComponent(filterTgl.trim());
    }
    console.log("[PCare AutoFiller] [Modul 2] Fetch data pasien dari Apps Script:", fetchUrl);
    showNotification(`Mengambil data kunjungan dari Google Sheets (${sheetTarget})${filterTgl ? ` (${filterTgl})` : ""}...`, "info");

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Gagal fetch Google Sheets: HTTP status ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== "success" || !Array.isArray(result.data)) {
      throw new Error(result.message || "Format data JSON Apps Script tidak sesuai.");
    }

    const allPatients = result.data;
    const dateLabel = result.filteredDate ? ` [Filter Tanggal: ${result.filteredDate}]` : "";
    console.log(`[PCare AutoFiller] [Modul 2] Total data diterima dari Sheets: ${allPatients.length} baris${dateLabel}.`);

    // 3. Filter Data: HANYA proses pasien yang memiliki hasil lab (tidak kosong semua)
    let labPatients = allPatients.filter(p => hasLabData(p));
    console.log(`[PCare AutoFiller] [Modul 2] Pasien dengan data hasil lab terisi: ${labPatients.length} pasien.`);

    if (labPatients.length === 0) {
      const msg = `Tidak ditemukan pasien terdaftar dengan data hasil lab terisi di sheet '${sheetTarget}'${filterTgl ? ` pada tanggal '${filterTgl}'` : ""}. Pastikan Kolom TGL ENTRI terisi dan baris belum berwarna merah/salem.`;
      showNotification(msg, "warning");
      alert(msg);
      return;
    }

    // Terapkan batas limit jika dipilih di popup (limit > 0)
    const maxLimit = Number(limit) || 0;
    if (maxLimit > 0 && labPatients.length > maxLimit) {
      console.log(`[PCare AutoFiller] [Modul 2] Pilihan Limit Aktif: Membatasi dari ${labPatients.length} pasien lab menjadi ${maxLimit} pasien pertama.`);
      labPatients = labPatients.slice(0, maxLimit);
    }

    showNotification(`Ditemukan ${labPatients.length} pasien dengan data lab${maxLimit > 0 ? ` (Dibatasi ${maxLimit} Pasien)` : ""}. Memulai pemrosesan (${modeLabel})...`, "info");

    let successCount = 0;
    let skippedCount = 0;

    // Bersihkan form kunjungan sebelum memulai perulangan pasien pertama
    await clickBatalKunjungan();

    // Lacak frekuensi kemunculan pasien pada hari yang sama (No BPJS & tglPly) sebagai fallback
    const patientSameDayFrequency = {};
    for (const p of labPatients) {
      const bStr = String(p.noBpjs || p.rawCols?.D || "").trim().padStart(13, "0");
      const pDate = convertToDDMMYYYY(p.tglPly || p.effectiveDate);
      if (bStr && pDate) {
        const k = `${bStr}_${pDate}`;
        patientSameDayFrequency[k] = (patientSameDayFrequency[k] || 0) + 1;
      }
    }
    const seenSameDayOrder = {};

    // 4. Looping setiap pasien yang lolos filter
    for (let i = 0; i < labPatients.length; i++) {
      // Penanganan Session Timeout di dalam loop
      if (isSessionExpired()) {
        console.error("[PCare AutoFiller] [Modul 2] Sesi PCare habis saat iterasi antrean pasien. Menghentikan bot secara aman.");
        showNotification("[PERINGATAN] Sesi PCare telah habis! Menghentikan antrean bot...", "error");
        alert("Sesi PCare Anda telah berakhir / logout otomatis saat pemrosesan antrean. Bot dihentikan secara aman.");
        break;
      }

      const patient = labPatients[i];
      const rawAntrean = String(patient.antrean || patient.noAntrean || patient.rawCols?.A || "").trim();
      const cleanAntreanNum = rawAntrean.replace(/\D/g, "");
      const antrianNum = cleanAntreanNum || String(i + 1);

      // Format No. Kartu BPJS 13 digit
      const rawNo = String(patient.noBpjs || patient.rawCols?.D || "").trim();
      const noBpjsFormatted = rawNo.padStart(13, "0");
      patient.noBpjsFormatted = noBpjsFormatted;

      // Evaluasi penandaan duplikat hari yang sama jika belum terdeteksi dari backend
      const sameDayKey = (noBpjsFormatted && patient.tglPly) ? `${noBpjsFormatted}_${convertToDDMMYYYY(patient.tglPly)}` : "";
      if (sameDayKey) {
        seenSameDayOrder[sameDayKey] = (seenSameDayOrder[sameDayKey] || 0) + 1;
      }
      const orderIdx = sameDayKey ? seenSameDayOrder[sameDayKey] : 1;
      const countForKey = sameDayKey ? (patientSameDayFrequency[sameDayKey] || 1) : 1;

      if (!patient.isDuplicateSameDay && countForKey > 1) {
        const rawDiagStr = String(patient.diagnosa || patient.rawCols?.AI || patient.rawCols?.Y || "").toLowerCase().replace(/\s+/g, "");
        const rawKelStr = String(patient.keluhan || patient.rawCols?.AD || patient.rawCols?.T || "").toLowerCase();
        const rawPelStr = String(patient.pelayananNonKapitasi || patient.rawCols?.AO || patient.rawCols?.AP || "").toLowerCase();
        const isSkriningIndication = (
          rawDiagStr === "z13.1" || rawDiagStr === "z131" ||
          rawKelStr.includes("skrining") ||
          rawPelStr.includes("skrining") || rawPelStr.includes("penapisan")
        );
        if (orderIdx > 1 || isSkriningIndication) {
          patient.isDuplicateSameDay = true;
          patient.tglOffset = addDaysToDateString(patient.tglPly, 1);
          if (!patient.tglEntri) {
            patient.effectiveDate = patient.tglOffset;
          }
        }
      }

      const idLabel = searchMode === "antrian" ? `Antrean #${antrianNum} (${patient.nama || "Pasien"})` : `BPJS: ${noBpjsFormatted} (${patient.nama || "Pasien"})`;
      const progressLabel = `[${i + 1}/${labPatients.length}] ${idLabel}`;
      console.log(`\n===============================================================`);
      console.log(`[PCare AutoFiller] [Modul 2] Memproses ${progressLabel} [Mode: ${modeLabel}]`);
      console.log(`===============================================================`);
      showNotification(`Memproses ${progressLabel}...`, "info");

      try {
        const ok = await processSinglePatientKunjungan(patient, searchMode, antrianNum);
        if (ok) {
          successCount++;
          console.log(`[PCare AutoFiller] [Modul 2] [SUKSES] Sukses memproses kunjungan & lab: ${idLabel}`);
          showNotification(`[SUKSES] Selesai: ${progressLabel}`, "success");
        } else {
          skippedCount++;
          console.warn(`[PCare AutoFiller] [Modul 2] [PERINGATAN] Kunjungan dilewati untuk: ${idLabel}`);
        }
      } catch (err) {
        skippedCount++;
        console.error(`[PCare AutoFiller] [Modul 2] [ERROR] Gagal memproses ${idLabel}:`, err);
        showNotification(`[PERINGATAN] Gagal: ${idLabel} (${err.message})`, "warning");
      }

      // Sebelum memproses antrean berikutnya, klik tombol Batal pada form kunjungan agar isian sebelumnya bersih, lalu beri jeda istirahat stabil 2.5 detik
      if (i < labPatients.length - 1) {
        console.log(`[PCare AutoFiller] [Modul 2] Menyiapkan antrean berikutnya (Antrean #${i + 2})... Mengklik Batal & jeda stabil 2.5 detik.`);
        await clickBatalKunjungan();
        showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
        await delay(2500);
      }
    }

    const finalSummary = `Otomasi Entri Kunjungan Selesai!\nBerhasil: ${successCount}\nDilewati/Gagal: ${skippedCount}\nTotal: ${labPatients.length}`;
    console.log(`[PCare AutoFiller] [Modul 2] ${finalSummary}`);
    showNotification(`Selesai! Berhasil: ${successCount}, Gagal: ${skippedCount}`, "success");
    alert(finalSummary);

  } catch (err) {
    console.error("[PCare AutoFiller] [Modul 2] Error fatal:", err);
    showNotification(`Error: ${err.message}`, "error");
    alert("Terjadi kesalahan pada Otomasi Entri Kunjungan: " + err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Eksekusi Radio Button Sumber Data (No. Antrian vs No. Kartu)
 * Memastikan radio antrean/kartu benar-benar terpilih dan terpicu di DOM PCare (termasuk jQuery event jika ada).
 */
async function setSumberData(mode) {
  // mode: 'antrian' atau 'kartu'
  const selector = mode === 'antrian'
    ? '#rbnoantrian, input[name="rdpilih"][value="0"], input[name="rbpilih"][value="0"], input[value="0"][type="radio"]'
    : '#rbkartu, input[name="rdpilih"][value="1"], input[name="rbpilih"][value="1"], input[value="1"][type="radio"]';

  const radioEl = document.querySelector(selector);
  if (radioEl) {
    radioEl.checked = true;
    radioEl.click();
    radioEl.dispatchEvent(new Event('change', { bubbles: true }));
    const $jq = window.jQuery || (typeof $ !== 'undefined' ? $ : null);
    if ($jq) {
      $jq(radioEl).trigger('change').trigger('click');
    }
  }
  const labelEl = document.querySelector(mode === 'antrian' ? 'label[for="rbnoantrian"]' : 'label[for="rbkartu"]');
  if (labelEl) {
    labelEl.click();
  }
  await delay(500);
}

/**
 * Helper: Menangani penolakan item lab oleh server BPJS (aturan frekuensi / batas klaim) secara non-fatal
 * Menangani pesan seperti 'Minimal pelayanan setiap 6 bulan sekali' atau 'Pelayanan hanya boleh 1 kali dalam satu bulan'
 */
async function handleBpjsLabItemRejection(tabSelector = "#tabDet_10") {
  await delay(800);

  let alertText = null;

  // 1. Cek dialog SweetAlert / Bootstrap modal
  const modals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show");
  for (const m of modals) {
    if (isElementVisible(m)) {
      const text = (m.textContent || "").trim();
      const textLower = text.toLowerCase();
      if (
        textLower.includes("bulan sekali") ||
        textLower.includes("1 kali dalam satu bulan") ||
        textLower.includes("hanya boleh") ||
        textLower.includes("frekuensi") ||
        textLower.includes("tidak diijinkan") ||
        textLower.includes("tidak diizinkan") ||
        textLower.includes("sudah pernah")
      ) {
        alertText = text;
        const btnOk = m.querySelector("button.confirm, .swal2-confirm, button.close, .btn-primary, button");
        if (btnOk) {
          btnOk.click();
          await delay(400);
        }
        break;
      }
    }
  }

  // 2. Cek Toastr notification atau elemen alert di layar
  if (!alertText) {
    const alertEls = document.querySelectorAll(".toast, .toast-warning, .toast-error, .alert-warning, .alert-danger, .help-block");
    for (const a of alertEls) {
      if (isElementVisible(a)) {
        const text = (a.textContent || "").trim();
        const textLower = text.toLowerCase();
        if (
          textLower.includes("bulan sekali") ||
          textLower.includes("1 kali dalam satu bulan") ||
          textLower.includes("hanya boleh") ||
          textLower.includes("frekuensi")
        ) {
          alertText = text;
          break;
        }
      }
    }
  }

  // 3. Fallback cek innerText body
  if (!alertText) {
    const bodyText = document.body.innerText || "";
    if (bodyText.includes("Minimal pelayanan setiap 6 bulan sekali") || bodyText.includes("Pelayanan hanya boleh 1 kali dalam satu bulan")) {
      alertText = bodyText.includes("Minimal pelayanan setiap 6 bulan sekali")
        ? "Minimal pelayanan setiap 6 bulan sekali"
        : "Pelayanan hanya boleh 1 kali dalam satu bulan";
    }
  }

  if (alertText) {
    console.warn('[PCare AutoFiller] Item lab ditolak BPJS karena aturan frekuensi klaim:', alertText);
    showNotification(`[PERINGATAN] Item lab dilewati BPJS (aturan frekuensi): ${alertText}`, "warning");

    // Klik tombol Batal pada form lab yang ditolak agar form tertutup kembali:
    const btnBatal = document.querySelector(`${tabSelector} button.btn-danger`) ||
      document.querySelector('#tabDet_10 button.btn-danger, #tabDet_12 button.btn-danger, #tabDet_11 button.btn-danger') ||
      Array.from(document.querySelectorAll(`${tabSelector} button, button`)).find(b => (b.textContent || '').trim() === 'Batal');
    if (btnBatal) {
      console.log(`[PCare AutoFiller] Menutup form item lab dengan tombol Batal...`);
      btnBatal.click();
      await delay(800);
    }
    return true;
  }

  return false;
}

/**
 * Helper: Mengisi, mengetik, dan memilih diagnosa ICD-10 di form PCare (#kddiagnosa1)
 * Mendukung pencarian dropdown autocomplete (jQuery UI / Bootstrap Typeahead / Select2)
 * serta trigger event standar untuk validasi form PCare.
 */
async function selectDiagnosaPCare(targetCode) {
  if (!targetCode) return false;

  const selector = SELECTORS_KUNJUNGAN.diagnosa || "#kddiagnosa1";
  const diagInput = document.querySelector(selector);
  if (!diagInput) {
    console.warn(`[PCare AutoFiller] [WARNING] Element diagnosa '${selector}' tidak ditemukan.`);
    return false;
  }

  const cleanCode = String(targetCode).trim().toUpperCase();
  console.log(`[PCare AutoFiller] [Diagnosa] Mengetik dan mencari kode ICD-10: "${cleanCode}"...`);

  // 1. Fokus ke input dan kosongkan nilai lama
  diagInput.focus();
  diagInput.value = "";
  diagInput.dispatchEvent(new Event("focus", { bubbles: true }));
  await sleep(150);

  // 2. Ketik kode karakter dan trigger event input & keydown/keyup
  diagInput.value = cleanCode;
  diagInput.dispatchEvent(new Event("input", { bubbles: true }));
  diagInput.dispatchEvent(new KeyboardEvent("keydown", { key: cleanCode.slice(-1), code: `Key${cleanCode.slice(-1)}`, bubbles: true }));
  diagInput.dispatchEvent(new KeyboardEvent("keyup", { key: cleanCode.slice(-1), code: `Key${cleanCode.slice(-1)}`, bubbles: true }));

  // 3. Integrasi jQuery / jQuery UI Autocomplete jika ada
  const $jq = window.jQuery || (typeof $ !== "undefined" ? $ : null);
  if ($jq && $jq(diagInput).length) {
    try {
      $jq(diagInput).val(cleanCode).trigger("input").trigger("change");
      if ($jq(diagInput).data("ui-autocomplete") || $jq(diagInput).data("autocomplete")) {
        $jq(diagInput).autocomplete("search", cleanCode);
      }
    } catch (err) {
      console.warn("[PCare AutoFiller] Gagal memicu jQuery UI autocomplete:", err);
    }
  }

  // Jeda agar menu autocomplete selesai ditarik dari server BPJS
  await delay(800);

  // 4 & 5. Polling dinamis hingga maksimal 3000ms (interval 200ms) menunggu opsi dropdown autocomplete muncul dan visible
  const autocompleteMenuSelectors = [
    ".ui-autocomplete:not([style*='display: none']) .ui-menu-item",
    ".ui-autocomplete:not([style*='display: none']) li",
    ".typeahead.dropdown-menu:not([style*='display: none']) li",
    ".select2-results__option",
    "ul.ui-autocomplete li",
    "div.autocomplete-suggestions .autocomplete-suggestion"
  ];

  let selectedOption = null;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 3000) {
    for (const menuSel of autocompleteMenuSelectors) {
      const items = Array.from(document.querySelectorAll(menuSel)).filter(el => isElementVisible(el));
      if (items.length > 0) {
        // Prioritaskan opsi yang mengandung kode ICD
        selectedOption = items.find(item => {
          const txt = (item.textContent || "").toUpperCase();
          return txt.includes(cleanCode);
        }) || items[0];
        if (selectedOption) break;
      }
    }
    if (selectedOption) break;
    await sleep(200);
  }

  if (selectedOption) {
    console.log(`[PCare AutoFiller] [Diagnosa] Opsi dropdown ditemukan: "${selectedOption.textContent?.trim()}". Memilih opsi...`);
    const clickTarget = selectedOption.querySelector("a, span, div") || selectedOption;
    clickTarget.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickTarget.click();
    await delay(600);
  } else {
    // Jika dropdown visual tidak muncul, trigger event Enter
    diagInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    diagInput.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    diagInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    await delay(600);
  }

  // 6. Trigger final events change, focusout, blur
  diagInput.dispatchEvent(new Event("change", { bubbles: true }));
  diagInput.dispatchEvent(new Event("focusout", { bubbles: true }));
  diagInput.dispatchEvent(new Event("blur", { bubbles: true }));

  if ($jq && $jq(diagInput).length) {
    try {
      $jq(diagInput).trigger("change").trigger("blur");
    } catch (e) { }
  }

  await delay(600);
  console.log(`[PCare AutoFiller] [Diagnosa] Berhasil menetapkan kode diagnosa: "${cleanCode}".`);
  return true;
}

/**
 * Alur Lengkap Pemrosesan Satu Pasien pada Halaman Entri Kunjungan
 */
async function processSinglePatientKunjungan(patient, searchMode = "kartu", queueIndex = 1) {
  // Penanganan Session Timeout (Auto-Logout PCare)
  if (isSessionExpired()) {
    console.error("[PCare AutoFiller] [Modul 2] Sesi PCare telah kedaluwarsa sebelum memproses pasien.");
    throw new Error("Sesi PCare habis / halaman login terdeteksi. Silakan login kembali ke PCare BPJS.");
  }

  const noBpjs = patient.noBpjsFormatted;
  const lab = extractLabResults(patient);
  patient.labResults = patient.labResults || lab;

  console.log(`[PCare AutoFiller] [Modul 2] Data Lab Pasien ${noBpjs}:`, lab);

  // 0. Penentuan Paket Non-Kapitasi Pasien (Didefinisikan di awal agar dapat diakses semua tahap)
  const paketStr = String(patient.pelayananNonKapitasi || patient.rawCols?.AO || patient.rawCols?.AP || '');
  const lr = patient.labResults || lab || {};
  const targetValues = [];

  if (paketStr.includes('Gula') || (lr.gdp || lr.gdpp || lr.gds)) {
    targetValues.push('10');
  }
  if (paketStr.includes('HbA1c') || lr.hba1c) {
    targetValues.push('11');
  }
  if (paketStr.includes('Kimia') || (lr.cho || lr.tg || lr.hdl)) {
    targetValues.push('12');
  }
  const paketLower = paketStr.toLowerCase();
  if (paketLower.includes('serviks') || paketLower.includes('papsmear')) {
    targetValues.push('25');
  }
  if (paketLower.includes('skrining dm')) {
    targetValues.push('26');
  }

  // -------------------------------------------------------------
  // TAHAP 1: PENCARIAN & FORM AWAL
  // -------------------------------------------------------------

  // 1. Bersihkan State Awal label kartu & nama di DOM sebelum mencari pasien baru
  try {
    const initialCardEl = document.querySelector('#noKartu_lbl, #lblNoKartu, #noKartu, #lblNoPeserta');
    if (initialCardEl) { initialCardEl.textContent = ''; initialCardEl.innerText = ''; }
    const initialNameEl = document.querySelector('#namaPeserta, #lblNamaPeserta, #nama, #lblNama');
    if (initialNameEl) { initialNameEl.textContent = ''; initialNameEl.innerText = ''; }
  } catch (e) { }

  // 1a. SINKRONISASI TANGGAL KUNJUNGAN:
  // Form tanggal kunjungan PCare pada Modul 2 wajib menggunakan patient.effectiveDate (format DD-MM-YYYY),
  // yang otomatis merujuk ke TGL HASIL untuk pasien Pap Smear, dan TGL PLY / TGL OFFSET (H+1 untuk duplikat) untuk pasien Prolanis/Skrining.
  // Jangan menggunakan tanggal hari ini (backdate sesuai tanggal hasil / pelayanan).
  const effectiveDateVal = patient.effectiveDate || patient.tglOffset || patient.tglHasil || patient.tglPly || patient.rawCols?.effectiveDate || patient.rawCols?.tglOffset || patient.rawCols?.tglHasil || patient.rawCols?.C || patient.rawCols?.B || patient.tglEntri;
  if (!effectiveDateVal) {
    console.warn(`[PCare AutoFiller] [Modul 2] Peringatan: Tidak ditemukan nilai effectiveDate/tglHasil/tglPly untuk pasien ${noBpjs}.`);
  }
  const targetDateStr = convertToDDMMYYYY(effectiveDateVal);

  if (patient.isDuplicateSameDay) {
    console.log(`[PCare AutoFiller] [Modul 2] Pasien ganda terdeteksi (${patient.nama || noBpjs}) -> Tanggal kunjungan disesuaikan H+1: ${targetDateStr}`);
    showNotification(`Pasien ganda terdeteksi (${patient.nama || noBpjs}) -> Tanggal disesuaikan H+1: ${targetDateStr}`, "info");
  }

  console.log(`[PCare AutoFiller] [Modul 2] Step 1: Sinkronisasi tanggal kunjungan #txttanggal ke "${targetDateStr}" (effectiveDate: "${patient.effectiveDate || '-'}", tglOffset: "${patient.tglOffset || '-'}", tglHasil: "${patient.tglHasil || '-'}", tglPly: "${patient.tglPly || '-'}")...`);
  showNotification(`Sinkronisasi tanggal: ${targetDateStr}...`, "info");

  // TITIK A: Tepat sebelum memilih sumber data (kartu/antrian) dan poli
  await enforceTanggalKunjungan(targetDateStr);
  await sleep(200);

  // 1b. Eksekusi Radio Button Sumber Data (No. Antrian vs No. Kartu)
  console.log(`[PCare AutoFiller] [Modul 2] Step 1: Memilih Sumber Data Mode: ${searchMode}...`);
  await setSumberData(searchMode);

  // 1c. Set Poli Tujuan ke "004" (LABORATORIUM) jika belum
  console.log(`[PCare AutoFiller] [Modul 2] Step 1: Mengatur Poli Tujuan ke '004' (LABORATORIUM)...`);
  safeSelect(SELECTORS_KUNJUNGAN.poli, "004");
  await delay(600);

  // TITIK B: Tepat sebelum memasukkan nomor dan menekan tombol cari (#btnCari / Enter)
  await enforceTanggalKunjungan(targetDateStr);
  await sleep(200);

  // 1d. Masukkan nomor (No. Antrian atau No. Kartu BPJS 13 digit) ke #nomor
  const nomorEl = document.querySelector(SELECTORS_KUNJUNGAN.nomor);
  if (!nomorEl) {
    throw new Error("Elemen input nomor (#nomor) tidak ditemukan.");
  }
  nomorEl.focus();
  nomorEl.removeAttribute("maxlength");
  nomorEl.value = "";
  await sleep(100);

  const rawAntrean = String(patient.antrean || patient.noAntrean || patient.rawCols?.A || queueIndex || "1").trim();
  const cleanAntrean = rawAntrean.replace(/\D/g, "") || String(queueIndex || "1");
  const noAntrian = cleanAntrean;
  const inputTargetVal = searchMode === 'antrian' ? noAntrian : noBpjs;
  console.log(`[PCare AutoFiller] [Modul 2] Step 1: Mengisi #nomor (${searchMode === 'antrian' ? 'No. Antrian' : 'No. Kartu BPJS 13 Digit'}): "${inputTargetVal}"`);

  nomorEl.value = inputTargetVal;
  nomorEl.dispatchEvent(new Event("input", { bubbles: true }));
  nomorEl.dispatchEvent(new Event("change", { bubbles: true }));
  nomorEl.dispatchEvent(new Event("blur", { bubbles: true }));

  if (searchMode !== 'antrian' && nomorEl.value !== noBpjs) {
    nomorEl.removeAttribute("maxlength");
    nomorEl.value = noBpjs;
    nomorEl.dispatchEvent(new Event("input", { bubbles: true }));
    nomorEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  await sleep(400);

  // Simulasikan Enter & Klik Cari
  nomorEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
  nomorEl.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
  nomorEl.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));

  console.log(`[PCare AutoFiller] [Modul 2] Step 1: Memicu klik tombol Cari Peserta...`);
  const btnSearch = document.querySelector("#nomor ~ button") ||
    document.querySelector("#nomor")?.parentElement?.querySelector("button") ||
    document.querySelector("button i.fa-search")?.closest("button") ||
    document.querySelector("#btnCari") ||
    findSearchButtonKunjungan() ||
    document.querySelector("#btnCariPeserta");

  if (btnSearch) {
    btnSearch.click();
    btnSearch.dispatchEvent(new Event("click", { bubbles: true }));
    console.log(`[Modul 2] Tombol cari (${searchMode}) berhasil diklik!`);
  } else {
    console.warn("[Modul 2] Tombol cari tidak ditemukan secara langsung, mengandalkan event Enter.");
  }
  // Jeda tunggu awal setelah klik cari sebelum mulai memeriksa data profil peserta
  await delay(1200);

  // -------------------------------------------------------------
  // VALIDASI IDENTITAS KETAT & ANTI FALSE-LOADED (STRICT IDENTITY MATCH)
  // Polling maksimal 10 detik menunggu teks nomor kartu di PCare muncul
  // -------------------------------------------------------------
  const searchLabel = searchMode === 'antrian' ? `Antrean #${noAntrian}` : noBpjs;
  console.log(`[PCare AutoFiller] [Modul 2] Polling profil nomor BPJS PCare untuk ${searchLabel} (maksimal 10 detik)...`);
  showNotification(`Mencari profil PCare ${searchLabel}...`, "info");

  const sheetNoKartu = String(patient.noBpjs || patient.noBpjsFormatted || '').replace(/\D/g, '');
  const startWaitCard = Date.now();
  let currentPcareCard = "";
  let isAlreadyServedInSearch = false;

  while (Date.now() - startWaitCard < 10000) {
    // 1. Periksa apakah muncul SweetAlert atau notifikasi bertuliskan "sudah dilayani", "sudah pernah", atau "kunjungan sudah ada"
    const servedModals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show, .toast, .alert");
    for (const m of servedModals) {
      if (isElementVisible(m)) {
        const mTxt = (m.textContent || "").toLowerCase();
        if (mTxt.includes("sudah dilayani") || mTxt.includes("sudah pernah") || mTxt.includes("kunjungan sudah ada")) {
          console.log(`[PCare AutoFiller] [Modul 2] Peringatan pasien sudah dilayani / pernah dientri terdeteksi pada pencarian: "${mTxt.trim()}"`);
          isAlreadyServedInSearch = true;
          // Tutup SweetAlert konfirmasi tersebut
          const btnConfirm = m.querySelector("button.confirm, .swal2-confirm, button.close, .btn-primary, button") ||
            document.querySelector(".swal2-confirm, .sweet-alert button.confirm, button.confirm");
          if (btnConfirm) {
            btnConfirm.click();
            btnConfirm.dispatchEvent(new Event("click", { bubbles: true }));
          }
          await sleep(500);
          break;
        }
      }
    }
    if (isAlreadyServedInSearch) {
      break;
    }

    // 2. Periksa apakah notifikasi 'Data tidak ditemukan' muncul
    const notFoundEl = Array.from(document.querySelectorAll('.toast-error, .alert-danger, .alert-warning, .swal2-html-container, .sweet-alert p')).find(el => {
      const txt = (el.textContent || '').toLowerCase();
      return txt.includes('data tidak ditemukan') || txt.includes('tidak ditemukan');
    });
    if (notFoundEl && isElementVisible(notFoundEl)) {
      console.warn(`[PCare AutoFiller] [Modul 2] Notifikasi 'Data tidak ditemukan' terdeteksi: "${notFoundEl.textContent.trim()}".`);
      break;
    }

    const kartuEl = document.querySelector('#noKartu_lbl, #lblNoKartu, #noKartu, #noPeserta, #lblNoPeserta');
    if (kartuEl) {
      const cardText = (kartuEl.textContent || kartuEl.innerText || '').trim();
      const digits = cardText.replace(/\D/g, '');
      if (digits.length >= 8) {
        currentPcareCard = digits;
        break;
      }
    }
    await sleep(400);
  }

  let isSkipFormKunjunganToLab = false;
  if (isAlreadyServedInSearch) {
    await sleep(600);
    const tabOpen = Array.from(document.querySelectorAll('#tab_0, #tabDet_10, #tabDet_12, #tabDet_11, #tambahPelayananGulaDarah_btn, a[href="#tabDet_10"], a[href="#tabDet_12"]')).some(el => isElementVisible(el));
    if (tabOpen && targetValues.length > 0) {
      console.log(`[PCare AutoFiller] [Modul 2] Pasien sudah dilayani sebelumnya dan tab Klaim Non Kapitasi terbuka. Melanjutkan pengisian rincian lab...`);
      showNotification(`Pasien sudah dilayani, melanjutkan rincian lab...`, "info");
      isSkipFormKunjunganToLab = true;
    } else {
      console.log(`[PCare AutoFiller] [Modul 2] Pasien sudah dilayani sebelumnya dan tab lab tidak terbuka / tidak ada paket lab. Menandai selesai di Sheets...`);
      showNotification(`Pasien sudah dilayani sebelumnya. Menandai selesai di Sheets...`, "info");
      await markHasilSelesaiInSheets(patient.rowNumber, noBpjs, patient.sheetName, patient.tglPly, patient.tglHasil, patient.effectiveDate || targetDateStr);
      return true;
    }
  }

  if (!isSkipFormKunjunganToLab) {
    // Jika currentPcareCard === '': JANGAN PERNAH ISI FORM! Lempar error
    if (currentPcareCard === '') {
      console.error(`[PCare AutoFiller] [Modul 2] Timeout: Profil nomor BPJS tidak termuat di PCare untuk ${searchLabel}. Jangan isi form!`);
      showNotification(`Timeout: Profil nomor BPJS tidak termuat di PCare!`, "error");
      throw new Error("Timeout: Profil nomor BPJS tidak termuat di PCare.");
    }

    // Jika currentPcareCard !== sheetNoKartu: Fallback 1x via #rbkartu
    if (currentPcareCard !== sheetNoKartu) {
      console.warn(`[PCare AutoFiller] Data tertukar/tidak cocok! Terbaca ${currentPcareCard}, seharusnya ${sheetNoKartu}. Mencoba fallback 1x via No. Kartu BPJS...`);
      showNotification(`Data tidak cocok (${currentPcareCard} != ${sheetNoKartu})! Fallback ke No. Kartu...`, "warning");

      // 1x Fallback: Pindahkan radio ke #rbkartu
      await setSumberData("kartu");
      await enforceTanggalKunjungan(targetDateStr);
      await sleep(200);

      const fallbackNomorEl = document.querySelector('#nomor, ' + SELECTORS_KUNJUNGAN.nomor);
      if (fallbackNomorEl) {
        fallbackNomorEl.removeAttribute('maxlength');
        fallbackNomorEl.focus();
        fallbackNomorEl.value = sheetNoKartu;
        fallbackNomorEl.dispatchEvent(new Event('input', { bubbles: true }));
        fallbackNomorEl.dispatchEvent(new Event('change', { bubbles: true }));
        fallbackNomorEl.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      await sleep(300);

      // Klik Cari
      const fallbackBtnSearch = document.querySelector("#nomor ~ button") ||
        document.querySelector("#nomor")?.parentElement?.querySelector("button") ||
        document.querySelector("button i.fa-search")?.closest("button") ||
        document.querySelector("#btnCari") ||
        findSearchButtonKunjungan() ||
        document.querySelector("#btnCariPeserta");

      if (fallbackBtnSearch) {
        fallbackBtnSearch.click();
        fallbackBtnSearch.dispatchEvent(new Event("click", { bubbles: true }));
      } else if (fallbackNomorEl) {
        fallbackNomorEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }
      // Jeda tunggu awal setelah klik cari fallback
      await delay(1200);

      // Tunggu maksimal 6 detik
      const startWaitFallback = Date.now();
      let fallbackPcareCard = "";
      while (Date.now() - startWaitFallback < 6000) {
        const servedModals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show, .toast, .alert");
        for (const m of servedModals) {
          if (isElementVisible(m)) {
            const mTxt = (m.textContent || "").toLowerCase();
            if (mTxt.includes("sudah dilayani") || mTxt.includes("sudah pernah") || mTxt.includes("kunjungan sudah ada")) {
              console.log(`[PCare AutoFiller] [Modul 2] Notifikasi pasien sudah dilayani / pernah dientri terdeteksi pada fallback: "${mTxt.trim()}"`);
              isAlreadyServedInSearch = true;
              const btnConfirm = m.querySelector("button.confirm, .swal2-confirm, button.close, .btn-primary, button") ||
                document.querySelector(".swal2-confirm, .sweet-alert button.confirm, button.confirm");
              if (btnConfirm) {
                btnConfirm.click();
                btnConfirm.dispatchEvent(new Event("click", { bubbles: true }));
              }
              await sleep(500);
              break;
            }
          }
        }
        if (isAlreadyServedInSearch) break;

        const kartuEl = document.querySelector('#noKartu_lbl, #lblNoKartu, #noKartu, #noPeserta, #lblNoPeserta');
        if (kartuEl) {
          const digits = (kartuEl.textContent || kartuEl.innerText || '').replace(/\D/g, '');
          if (digits && digits === sheetNoKartu) {
            fallbackPcareCard = digits;
            break;
          } else if (digits && digits !== currentPcareCard) {
            fallbackPcareCard = digits;
            break;
          }
        }
        await sleep(400);
      }

      if (isAlreadyServedInSearch) {
        await sleep(600);
        const tabOpen = Array.from(document.querySelectorAll('#tab_0, #tabDet_10, #tabDet_12, #tabDet_11, #tambahPelayananGulaDarah_btn, a[href="#tabDet_10"], a[href="#tabDet_12"]')).some(el => isElementVisible(el));
        if (tabOpen && targetValues.length > 0) {
          console.log(`[PCare AutoFiller] [Modul 2] Pasien sudah dilayani sebelumnya (fallback) dan tab Klaim Non Kapitasi terbuka. Melanjutkan pengisian rincian lab...`);
          showNotification(`Pasien sudah dilayani, melanjutkan rincian lab...`, "info");
          isSkipFormKunjunganToLab = true;
        } else {
          console.log(`[PCare AutoFiller] [Modul 2] Pasien sudah dilayani sebelumnya (fallback) dan tab lab tidak terbuka / tidak ada paket lab. Menandai selesai di Sheets...`);
          showNotification(`Pasien sudah dilayani sebelumnya. Menandai selesai di Sheets...`, "info");
          await markHasilSelesaiInSheets(patient.rowNumber, noBpjs, patient.sheetName, patient.tglPly, patient.tglHasil, patient.effectiveDate || targetDateStr);
          return true;
        }
      }

      if (!isSkipFormKunjunganToLab) {
        if (fallbackPcareCard !== sheetNoKartu) {
          console.error(`[PCare AutoFiller] [ERROR] Fallback gagal: Nomor kartu tetap tidak cocok (PCare: "${fallbackPcareCard || 'Kosong'}" != Sheet: "${sheetNoKartu}"). JANGAN ISI FORM!`);
          showNotification(`[ERROR] Pasien ${patient.nama || sheetNoKartu} tidak cocok di PCare! Dibatalkan.`, "error");
          throw new Error(`Data pasien tidak cocok dengan sheet PCare (${fallbackPcareCard || 'Kosong'} != ${sheetNoKartu}). Dibatalkan demi keamanan.`);
        }

        currentPcareCard = fallbackPcareCard;
        console.log(`[PCare AutoFiller] [SUKSES] Fallback No. Kartu berhasil cocok: ${sheetNoKartu} (${patient.nama || '-'}).`);
      }
    } else {
      console.log(`[PCare AutoFiller] [SUKSES] Profil nomor kartu cocok: ${sheetNoKartu} (${patient.nama || '-'}). Melanjutkan pengisian form.`);
    }
  }

  await sleep(300);

  if (!isSkipFormKunjunganToLab) {
    // -------------------------------------------------------------
    // TAHAP 2: PENGISIAN FORM KUNJUNGAN UTAMA
    // -------------------------------------------------------------
    console.log(`[PCare AutoFiller] [Modul 2] Step 2: Mengisi Form Kunjungan Utama...`);

    // 1. SMART AUTO-DETECT STATUS KEPESERTAAN DI PCARE (PROLANIS vs SKRINING)
    const isProlanis = checkIsProlanisInKunjungan(patient);

    // Ambil data nilai awal dari spreadsheet
    const rawDiag = (
      patient.diagnosa ||
      patient.rawCols?.diagnosa ||
      patient.rawCols?.AI ||
      patient.rawCols?.Y ||
      patient.rawCols?.Z ||
      ""
    ).toString().trim().toLowerCase();
    const diagClean = rawDiag.replace(/\s+/g, "");

    const rawKeluhan = (
      patient.keluhan ||
      patient.rawCols?.keluhan ||
      patient.rawCols?.AD ||
      patient.rawCols?.T ||
      patient.rawCols?.U ||
      patient.rawCols?.Y ||
      patient.rawCols?.AC ||
      ""
    ).toString().trim().toUpperCase();

    const rawAnamnesa = (
      patient.anamnesa ||
      patient.rawCols?.anamnesa ||
      patient.rawCols?.AE ||
      patient.rawCols?.AA ||
      ""
    ).toString().trim().toUpperCase();

    const labGula = patient.labResults || extractLabResults(patient);
    const hasGulaLab = Boolean(
      labGula.gdp || labGula.gdpp || labGula.gds ||
      patient.rawCols?.V || patient.rawCols?.W || patient.rawCols?.X ||
      patient.rawCols?.GDP || patient.rawCols?.GDPP || patient.rawCols?.GDS
    );

    let targetDiagnosa = "";
    let targetKeluhan = "";
    let targetAnamnesa = "";

    // 2. LOGIKA PENENTUAN DIAGNOSA, KELUHAN, DAN ANAMNESA
    // Prioritas 0: Indikasi Skrining DM (Pasien duplikat H+1, diagnosa Z13.1, keluhan skrining, atau bukan prolanis saat periksa gula)
    if (
      patient.isDuplicateSameDay === true ||
      diagClean === "z13.1" ||
      diagClean === "z131" ||
      rawKeluhan.includes("SKRINING") ||
      (!isProlanis && hasGulaLab)
    ) {
      targetDiagnosa = "Z13.1";
      targetKeluhan = "SKRINING DM";
      targetAnamnesa = "SKRINING DM";
    }
    // Kasus Hipertensi: diagnosa "i10" atau keluhan mengandung "HIPERTENSI"
    else if (diagClean === "i10" || rawKeluhan.includes("HIPERTENSI")) {
      targetDiagnosa = "I10";
      targetKeluhan = "HIPERTENSI";
      targetAnamnesa = "HIPERTENSI";
    }
    // Kasus Pap Smear: diagnosa "z12.4" atau keluhan mengandung "PAPSMEAR" / "PAP SMEAR" / "SERVIKS"
    else if (
      diagClean === "z12.4" ||
      diagClean === "z124" ||
      rawKeluhan.includes("PAPSMEAR") ||
      rawKeluhan.includes("PAP SMEAR") ||
      rawKeluhan.includes("SERVIKS")
    ) {
      targetDiagnosa = "Z12.4";
      targetKeluhan = "SKRINING KANKER SERVIKS";
      targetAnamnesa = "SKRINING KANKER SERVIKS";
    }
    // Kasus Gula Darah / Diabetes Prolanis:
    else if (
      !rawKeluhan ||
      rawKeluhan.includes("DIABETES") ||
      rawKeluhan.includes("DM") ||
      diagClean === "e11.9" ||
      diagClean === "e119" ||
      hasGulaLab
    ) {
      if (!isProlanis) {
        targetDiagnosa = "Z13.1";
        targetKeluhan = "SKRINING DM";
        targetAnamnesa = "SKRINING DM";
      } else {
        targetDiagnosa = "E11.9";
        targetKeluhan = "DIABETES MELITUS";
        targetAnamnesa = "DIABETES MELITUS";
      }
    }
    // Kasus Kode ICD-10 Lain di luar daftar di atas
    else if (rawDiag) {
      targetDiagnosa = rawDiag.toUpperCase();
      targetKeluhan = rawKeluhan || targetDiagnosa;
      targetAnamnesa = rawAnamnesa || targetKeluhan;
    }
    // Fallback umum
    else {
      if (!isProlanis) {
        targetDiagnosa = "Z13.1";
        targetKeluhan = "SKRINING DM";
        targetAnamnesa = "SKRINING DM";
      } else {
        targetDiagnosa = "E11.9";
        targetKeluhan = "DIABETES MELITUS";
        targetAnamnesa = "DIABETES MELITUS";
      }
    }

    // Log status hasil deteksi ke console dan floating status box
    const statusLabel = isProlanis ? "PROLANIS" : "SKRINING";
    console.log(`[PCare AutoFiller] Status: ${statusLabel} -> Diagnosa: ${targetDiagnosa}, Keluhan: ${targetKeluhan}`);
    showNotification(`Status: ${statusLabel} -> Diagnosa: ${targetDiagnosa}, Keluhan: ${targetKeluhan}`, "info");

    // 3. EKSEKUSI PENGISIAN FORM PCARE
    // Injeksi Keluhan
    safeInject(SELECTORS_KUNJUNGAN.keluhan, targetKeluhan);
    safeInject('#keluhan', targetKeluhan);
    await sleep(200);

    // Injeksi Anamnesa
    safeInject(SELECTORS_KUNJUNGAN.anamnesa, targetAnamnesa);
    safeInject('#anamnesa', targetAnamnesa);
    safeInject('#anamnesa_txt', targetAnamnesa);
    await sleep(200);

    // Jam Kunjungan: Wajib diset dan dikunci ke "07:00"
    await enforceJamKunjungan("07:00");
    await sleep(200);

    // Riwayat Alergi: Centang checkbox alergi lalu pilih dropdown 'Tidak Ada'
    safeCheckRadioOrCheckbox(SELECTORS_KUNJUNGAN.alergiMakanChk, true);
    await sleep(200);
    safeSelect(SELECTORS_KUNJUNGAN.alergiMakanSlc, "Tidak Ada") || safeSelect(SELECTORS_KUNJUNGAN.alergiMakanSlc, "01") || safeSelect(SELECTORS_KUNJUNGAN.alergiMakanSlc, "00");

    safeCheckRadioOrCheckbox(SELECTORS_KUNJUNGAN.alergiUdaraChk, true);
    await sleep(200);
    safeSelect(SELECTORS_KUNJUNGAN.alergiUdaraSlc, "Tidak Ada") || safeSelect(SELECTORS_KUNJUNGAN.alergiUdaraSlc, "01") || safeSelect(SELECTORS_KUNJUNGAN.alergiUdaraSlc, "00");

    safeCheckRadioOrCheckbox(SELECTORS_KUNJUNGAN.alergiObatChk, true);
    await sleep(200);
    safeSelect(SELECTORS_KUNJUNGAN.alergiObatSlc, "Tidak Ada") || safeSelect(SELECTORS_KUNJUNGAN.alergiObatSlc, "01") || safeSelect(SELECTORS_KUNJUNGAN.alergiObatSlc, "00");
    await sleep(200);

    // Prognosa: Wajib TIDAK dipilih (dibiarkan kosong / default "- Pilih -")
    const prognosaEl = document.querySelector(SELECTORS_KUNJUNGAN.prognosa || "#prognosa_slc");
    if (prognosaEl) {
      prognosaEl.value = "";
      prognosaEl.selectedIndex = 0;
      prognosaEl.dispatchEvent(new Event("change", { bubbles: true }));
      if (window.jQuery && window.jQuery(prognosaEl).length) {
        try {
          window.jQuery(prognosaEl).val("").trigger("change");
        } catch (e) { }
      }
    }
    await sleep(200);

    // Diagnosa ICD-10: Ketik dan pilih kode diagnosa di PCare dengan jeda yang cukup
    await selectDiagnosaPCare(targetDiagnosa);
    await sleep(400);

    // Kesadaran: Set ke "01" (Compos mentis)
    safeSelect(SELECTORS_KUNJUNGAN.kesadaran, "01") || safeSelect(SELECTORS_KUNJUNGAN.kesadaran, "Compos mentis");
    await sleep(200);

    // Suhu: Normalisasi (Wajib Titik, Bukan Koma)
    let suhuClean = String(patient.suhu || "36.0").replace(",", ".").trim();
    if (!suhuClean || isNaN(parseFloat(suhuClean))) suhuClean = "36.0";
    safeInject(SELECTORS_KUNJUNGAN.suhu, suhuClean);
    await sleep(200);

    // Data Fisik
    safeInject(SELECTORS_KUNJUNGAN.tb, patient.tb || patient.rawCols?.I || "160");
    safeInject(SELECTORS_KUNJUNGAN.bb, patient.bb || patient.rawCols?.J || "60");
    safeInject(SELECTORS_KUNJUNGAN.lp, patient.lp || patient.rawCols?.K || "80");
    safeInject(SELECTORS_KUNJUNGAN.sistole, patient.sistole || patient.rawCols?.H?.split("/")[0] || "120");
    safeInject(SELECTORS_KUNJUNGAN.diastole, patient.diastole || patient.rawCols?.H?.split("/")[1] || "80");
    safeInject(SELECTORS_KUNJUNGAN.respRate, patient.rr || patient.rawCols?.L || "20");
    safeInject(SELECTORS_KUNJUNGAN.heartRate, patient.hr || patient.rawCols?.M || "80");
    await sleep(300);

    // Status Pulang: Set ke "Berobat Jalan"
    safeSelect(SELECTORS_KUNJUNGAN.statusPulang, "Berobat Jalan") || safeSelect(SELECTORS_KUNJUNGAN.statusPulang, "1") || safeSelect(SELECTORS_KUNJUNGAN.statusPulang, "3");
    await sleep(400);

    // 4. Penanganan Field Teks Wajib (Bebas Error 'Field Required' & 'Min 4 Characters')
    console.log(`[PCare AutoFiller] [Modul 2] Mengisi field teks wajib (Terapi Medikamentosa, Terapi Non Medikamentosa, BMHP, Anamnesa)...`);
    safeInject('#terapiMedikamentosa_txt', 'Tidak ada');
    safeInject('#terapiNonMedikamentosa_txt', 'Tidak ada');
    safeInject('#BMHP_txt', 'Tidak ada');
    safeInject('#anamnesa_txt', targetAnamnesa);
    safeInject('#anamnesa', targetAnamnesa);
    await sleep(200);

    // 1. Pemilihan Tenaga Medis (#tenagamedis)
    console.log(`[PCare AutoFiller] [Modul 2] Memilih Tenaga Medis (#tenagamedis)...`);
    const namaMedis = (patient.rawCols?.AK || patient.tenagaMedis || '').toUpperCase();
    let valMedis = '647743'; // Default Dede Kurniasih
    if (namaMedis.includes('MINTO')) valMedis = '26767';
    else if (namaMedis.includes('AWIT')) valMedis = '647724';
    else if (namaMedis.includes('RETNO')) valMedis = '647736';
    else if (namaMedis.includes('AMINATUL')) valMedis = '714838';

    const $jq = window.jQuery || (typeof $ !== 'undefined' ? $ : null);
    if ($jq && $jq('#tenagamedis').data('select2')) {
      $jq('#tenagamedis').val(valMedis).trigger('change');
    } else {
      const el = document.querySelector('#tenagamedis');
      if (el) {
        el.value = valMedis;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    // Jeda setelah pemilihan Tenaga Medis agar sinkronisasi form stabil
    await delay(600);

    // 3. Pemilihan Paket Non-Kapitasi Wajib Eksklusif Sesuai Baris Pasien (#listNonKapitasi_slc):
    // Menggunakan targetValues yang telah ditentukan di awal proses
    console.log(`[PCare AutoFiller] [Modul 2] Memilih Pelayanan Non Kapitasi (#listNonKapitasi_slc)...`);
    console.log(`[PCare AutoFiller] [Modul 2] Paket pasien "${paketStr}" -> Target Select2:`, targetValues);

    // Manipulasi DOM standar tanpa inline script (Bebas dari CSP Error Manifest V3)
    const selectEl = document.querySelector('#listNonKapitasi_slc') || document.querySelector('select[name="listNonKapitasi_slc"]');
    if (selectEl) {
      // targetValues contoh: ['10'] untuk Gula Darah, ['12'] untuk Kimia Darah
      Array.from(selectEl.options).forEach(opt => {
        opt.selected = targetValues.includes(opt.value);
      });
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const $jqPCare = window.jQuery || (typeof $ !== 'undefined' ? $ : null);
    if ($jqPCare && $jqPCare('#listNonKapitasi_slc').length) {
      try {
        $jqPCare('#listNonKapitasi_slc').val(targetValues).trigger('change');
      } catch (e) { }
    }
    // Jeda setelah Paket Non-Kapitasi dipilih agar kalkulasi tarif PCare selesai di latar belakang
    await delay(600);

    // 1e. Catat No. Kunjungan awal dan pastikan tanggal serta jam kunjungan terkunci tepat 300ms sebelum simpan
    const initialNoKunjungan = extractNoKunjunganFromScreen(targetDateStr);
    // TITIK C: Tepat 300ms SEBELUM mengeklik tombol Simpan Kunjungan (#btnSimpan)
    await enforceTanggalKunjungan(targetDateStr);
    await enforceJamKunjungan("07:00");
    await sleep(300);

    // Jeda napas setelah semua field terisi dan tanggal terkunci
    await delay(1000);

    // Simpan Kunjungan (#btnSimpan)
    console.log(`[PCare AutoFiller] [Modul 2] Mengklik tombol Simpan Kunjungan (#btnSimpan)...`);
    showNotification("Menyimpan entri kunjungan...", "info");
    const saveOk = safeClick(SELECTORS_KUNJUNGAN.btnSimpan);
    if (!saveOk) {
      throw new Error("Gagal mengklik tombol Simpan Kunjungan (#btnSimpan).");
    }

    // 2. Bukti Sukses Wajib (Strict Kunjungan Save Verification):
    // Polling maksimal 10 detik setelah klik #btnSimpan untuk memastikan kunjungan benar-benar tersimpan
    let isVisitSaved = false;
    let finalNoKunjungan = "";
    let isAlreadyServed = false;
    const saveVerifyStart = Date.now();

    while (Date.now() - saveVerifyStart < 10000) {
      // Penanganan Pasien yang Sudah Dientri Manual di PCare:
      // Cek apakah muncul SweetAlert atau notifikasi bertuliskan "sudah dilayani", "sudah pernah dientri", atau "kunjungan sudah ada"
      const modals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show, .toast, .alert");
      for (const m of modals) {
        if (isElementVisible(m)) {
          const mTxt = (m.textContent || "").toLowerCase();
          if (mTxt.includes("sudah dilayani") || mTxt.includes("sudah pernah dientri") || mTxt.includes("kunjungan sudah ada")) {
            console.log(`[PCare AutoFiller] [Modul 2] Notifikasi pasien sudah pernah dientri / sudah dilayani terdeteksi: "${mTxt.trim()}"`);
            isAlreadyServed = true;
            // Tutup SweetAlert konfirmasi tersebut
            const btnConfirm = m.querySelector("button.confirm, .swal2-confirm, button.close, .btn-primary, button") ||
              document.querySelector(".swal2-confirm, .sweet-alert button.confirm, button.confirm");
            if (btnConfirm) {
              btnConfirm.click();
              btnConfirm.dispatchEvent(new Event("click", { bubbles: true }));
            }
            await sleep(500);
            break;
          }
        }
      }

      if (isAlreadyServed) {
        isVisitSaved = true;
        break;
      }

      // Kondisi a: Kontainer Klaim Non Kapitasi (#tab_0) atau sub-tab lab (#tabDet_10, #tabDet_12, #tabDet_11) atau tombol #tambahPelayananGulaDarah_btn muncul dan berstatus visible di layar
      const klaimVisible = Array.from(document.querySelectorAll('#tab_0, #tabDet_10, #tabDet_12, #tabDet_11, #tambahPelayananGulaDarah_btn')).some(el => isElementVisible(el));
      if (klaimVisible) {
        isVisitSaved = true;
        console.log(`[PCare AutoFiller] [Modul 2] Bukti sukses (a): Kontainer Klaim Non Kapitasi / sub-tab lab terdeteksi aktif.`);
        break;
      }

      // Kondisi b: Muncul toastr atau teks di halaman yang memuat "berhasil disimpan", "sukses", atau "tersimpan"
      const hasDangerAlert = Array.from(document.querySelectorAll(".toast-error, .alert-danger, .field-validation-error, .help-block.text-danger, span.help-block")).some(el => isElementVisible(el) && (el.textContent || '').trim().length > 0);
      const bodyText = (document.body.innerText || "").toLowerCase();
      const textSuccess = bodyText.includes("berhasil disimpan") || bodyText.includes("kunjungan berhasil disimpan") || bodyText.includes("sukses") || bodyText.includes("tersimpan");
      const toastSuccess = Array.from(document.querySelectorAll(".toast-success, .alert-success, .swal2-success, .sa-success")).some(el => isElementVisible(el));

      if ((textSuccess || toastSuccess) && !hasDangerAlert) {
        isVisitSaved = true;
        console.log(`[PCare AutoFiller] [Modul 2] Bukti sukses (b): Konfirmasi pesan berhasil disimpan terdeteksi.`);
        break;
      }

      // Kondisi c: Terbentuk nomor kunjungan valid pada tabel riwayat kunjungan peserta
      const currentNoKunjungan = extractNoKunjunganFromScreen(targetDateStr);
      if (currentNoKunjungan && currentNoKunjungan.length >= 10 && currentNoKunjungan !== initialNoKunjungan) {
        isVisitSaved = true;
        finalNoKunjungan = currentNoKunjungan;
        console.log(`[PCare AutoFiller] [Modul 2] Bukti sukses (c): Nomor kunjungan valid terbentuk: ${currentNoKunjungan}`);
        break;
      }

      // Cek pesan penolakan form nyata
      const saveError = checkFormKunjunganSaveError();
      if (saveError) {
        console.error(`[PCare AutoFiller] [Modul 2] [ERROR] Validasi form penolakan terdeteksi: "${saveError}"`);
        showNotification(`[ERROR] Form Ditolak: ${saveError}`, "error");
        throw new Error(`Validasi form kunjungan PCare gagal: ${saveError}`);
      }

      await sleep(400);
    }

    // JIKA BUKTI SUKSES TIDAK TERPENUHI: THROW ERROR dan JANGAN panggil markHasilSelesaiInSheets!
    if (!isVisitSaved) {
      console.error(`[PCare AutoFiller] [Modul 2] Gagal konfirmasi simpan kunjungan di PCare. Lewati tanpa menandai selesai.`);
      showNotification(`Gagal konfirmasi simpan kunjungan di PCare. TGL ENTRI dan warna sheet tetap utuh.`, "error");
      throw new Error("Gagal konfirmasi simpan kunjungan di PCare.");
    }

    console.log(`[PCare AutoFiller] [Modul 2] [SUKSES] Kunjungan berhasil tersimpan / terkonfirmasi! (No. Kunjungan: "${finalNoKunjungan || '-'}", Status: ${isAlreadyServed ? 'Sudah Dilayani' : 'Baru Tersimpan'})`);

    // Penanganan Pasien yang Sudah Dientri Manual di PCare:
    if (isAlreadyServed) {
      const tabOpen = Array.from(document.querySelectorAll('#tab_0, #tabDet_10, #tabDet_12, #tabDet_11, #tambahPelayananGulaDarah_btn, a[href="#tabDet_10"], a[href="#tabDet_12"]')).some(el => isElementVisible(el));
      if (!tabOpen) {
        console.log(`[PCare AutoFiller] [Modul 2] Pasien sudah dilayani sebelumnya dan form lab tidak terbuka. Langsung menandai selesai di Sheets...`);
        showNotification(`Pasien sudah dilayani sebelumnya. Menandai selesai di Sheets...`, "info");
        await markHasilSelesaiInSheets(patient.rowNumber, noBpjs, patient.sheetName, patient.tglPly, patient.tglHasil, patient.effectiveDate || targetDateStr);
        return true;
      }
    }
  } // Penutup if (!isSkipFormKunjunganToLab)

  // Tunggu container Klaim Non Kapitasi #tab_0 atau sub-tab muncul & scroll ke container:
  await waitForElement('#tab_0, #tabDet_10, a[href="#tabDet_10"], a[href="#tabDet_12"], #tambahPelayananGulaDarah_btn', 8000);
  const areaKlaim = document.querySelector('#tab_0') ||
    document.querySelector('#tabDet_10') ||
    document.querySelector('#tambahPelayananGulaDarah_btn')?.closest('.tab-pane') ||
    document.querySelector('.nav-tabs a[href*="tabDet"]')?.closest('.tab-content');
  if (areaKlaim) {
    areaKlaim.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await sleep(400);
  }

  // -------------------------------------------------------------
  // TAHAP 3: EKSEKUSI SUB-TAB KLAIM NON KAPITASI (#tab_0)
  // -------------------------------------------------------------
  console.log(`[PCare AutoFiller] [Modul 2] Step 3: Memulai eksekusi rincian lab Non Kapitasi...`);

  // Tab Gula Darah (#tabDet_10): Jika paket '10' (Gula Darah) terpilih
  if (targetValues.includes('10')) {
    await executeGulaDarah(lab, patient);
  } else {
    console.log(`[PCare AutoFiller] [Modul 2] Pasien tidak memiliki paket Gula Darah ('10'). Melewati tab Gula Darah.`);
  }

  // Tab Kimia Darah (#tabDet_12): Jika paket '12' (Kimia Darah) terpilih
  if (targetValues.includes('12')) {
    await executeKimiaDarah(lab, patient);
  } else {
    console.log(`[PCare AutoFiller] [Modul 2] Pasien tidak memiliki paket Kimia Darah ('12'). Melewati tab Kimia Darah.`);
  }

  // Tab HbA1c (#tabDet_11): Jika paket '11' (HbA1c) terpilih
  if (targetValues.includes('11')) {
    await executeHbA1c(lab, patient);
  } else {
    console.log(`[PCare AutoFiller] [Modul 2] Pasien tidak memiliki paket HbA1c ('11'). Melewati tab HbA1c.`);
  }

  // 4. Selesaikan Pasien
  // PENTING: Jangan pindah ke pasien berikutnya sebelum semua item lab yang ada di spreadsheet selesai diinput!
  console.log(`[PCare AutoFiller] [Modul 2] Seluruh hasil lab pasien ${noBpjs} selesai. Mengirim sinyal HASIL_SELESAI ke Sheets...`);
  await markHasilSelesaiInSheets(patient.rowNumber, noBpjs, patient.sheetName, patient.tglPly, patient.tglHasil, patient.effectiveDate || targetDateStr);

  return true;
}

/**
 * Sub-Modul A: Pelayanan Kimia Darah
 * Mapping periksa:
 * CHO -> Kolesterol Total
 * TG -> Trigliserida
 * HDL -> Kolesterol HDL
 * LDL -> Kolesterol LDL
 * UR -> Ureum
 * CRE -> Creatinin
 * MAU -> Micro Albuminuria
 */
async function executeKimiaDarah(lab, patient = {}) {
  const lr = patient.labResults || lab || {};
  const raw = patient.rawCols || {};
  const isMardiyati = (patient.nama && String(patient.nama).toLowerCase().includes('mardi')) || patient.rowNumber === 268;

  // Kimia Darah (Kolom N s/d T):
  // Kolom N (13): CHO, Kolom O (14): TG, Kolom P (15): HDL, Kolom Q (16): LDL, Kolom R (17): UR, Kolom S (18): CRE, Kolom T (19): MAU
  const choVal = isValidLabNumber(lr.cho) ? String(lr.cho).trim() : (isValidLabNumber(raw.N) ? String(raw.N).trim() : (isValidLabNumber(raw.CHO) ? String(raw.CHO).trim() : ""));
  const tgVal = isValidLabNumber(lr.tg) ? String(lr.tg).trim() : (isValidLabNumber(raw.O) ? String(raw.O).trim() : (isValidLabNumber(raw.TG) ? String(raw.TG).trim() : ""));
  const hdlVal = isValidLabNumber(lr.hdl) ? String(lr.hdl).trim() : (isValidLabNumber(raw.P) ? String(raw.P).trim() : (isValidLabNumber(raw.HDL) ? String(raw.HDL).trim() : ""));
  const ldlVal = isValidLabNumber(lr.ldl) ? String(lr.ldl).trim() : (isValidLabNumber(raw.Q) ? String(raw.Q).trim() : (isValidLabNumber(raw.LDL) ? String(raw.LDL).trim() : ""));
  let urVal = isValidLabNumber(lr.ur) ? String(lr.ur).trim() : (isValidLabNumber(raw.R) ? String(raw.R).trim() : (isValidLabNumber(raw.UR) ? String(raw.UR).trim() : ""));
  let creVal = isValidLabNumber(lr.cre) ? String(lr.cre).trim() : (isValidLabNumber(raw.S) ? String(raw.S).trim() : (isValidLabNumber(raw.CRE) ? String(raw.CRE).trim() : ""));
  const mauVal = isValidLabNumber(lr.mau) ? String(lr.mau).trim() : (isValidLabNumber(raw.T) ? String(raw.T).trim() : (isValidLabNumber(raw.MAU) ? String(raw.MAU).trim() : ""));

  if (isMardiyati) {
    urVal = "";
    creVal = "";
  }

  const kimiaMappings = [
    { key: "cho", label: "Kolesterol Total", keywords: ["kolesterol total", "cholesterol", "total", "cho"], val: choVal },
    { key: "tg", label: "Trigliserida", keywords: ["trigliserid", "triglyceride", "tg"], val: tgVal },
    { key: "hdl", label: "Kolesterol HDL", keywords: ["kolesterol hdl", "hdl"], val: hdlVal },
    { key: "ldl", label: "Kolesterol LDL", keywords: ["kolesterol ldl", "ldl"], val: ldlVal },
    { key: "ur", label: "Ureum", keywords: ["ureum", "urea", "ur"], val: urVal },
    { key: "cre", label: "Creatinin", keywords: ["creatinin", "kreatinin", "cre"], val: creVal },
    { key: "mau", label: "Micro Albuminuria", keywords: ["micro albuminuria", "albuminuria", "mau"], val: mauVal }
  ];

  // Lakukan perulangan HANYA pada tes yang memiliki nilai angka valid di spreadsheet.
  // Jika sel kosong di spreadsheet, lewati (jangan klik tambah data).
  const itemsToProcess = kimiaMappings.filter(item => isValidLabNumber(item.val));

  if (itemsToProcess.length === 0) {
    console.log("[PCare AutoFiller] [Kimia Darah] Tidak ada item kimia darah dengan angka valid di spreadsheet. Lewati tanpa membuka tab.");
    return;
  }

  console.log(`[PCare AutoFiller] [Kimia Darah] Memproses ${itemsToProcess.length} item:`, itemsToProcess.map(x => `${x.label}: ${x.val}`).join(", "));
  showNotification(`Mengisi Kimia Darah (${itemsToProcess.length} item)...`, "info");

  // 3. Eksekusi Tombol Tambah Data Baru & Pengisian Lab (Kimia Darah):
  // Pindah ke tab Kimia Darah: document.querySelector('a[href="#tabDet_12"]')?.click();
  document.querySelector('a[href="#tabDet_12"]')?.click();
  await waitForElement("#tabDet_12", 6000);

  for (const item of itemsToProcess) {
    if (!isValidLabNumber(item.val)) {
      console.warn(`[PCare AutoFiller] [Kimia Darah] Melewati "${item.label}" karena "${item.val}" bukan angka valid.`);
      continue;
    }

    console.log(`[PCare AutoFiller] [Kimia Darah] Menambahkan item: ${item.label} = ${item.val}`);
    showNotification(`Input Kimia Darah: ${item.label} = ${item.val}`, "info");

    // Klik tombol tambah: #tambahPelayananKimiaDarah_btn
    const btnTambahKimia = document.querySelector('#tambahPelayananKimiaDarah_btn') ||
      document.querySelector('#tabDet_12 button i.fa-plus')?.closest('button') ||
      document.querySelector('#tabDet_12 button[id*="tambah"]') ||
      document.querySelector('#tabDet_12 .btn-primary');

    if (btnTambahKimia) {
      btnTambahKimia.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btnTambahKimia.click();
      btnTambahKimia.dispatchEvent(new Event("click", { bubbles: true }));
    } else {
      console.warn(`[PCare AutoFiller] [Kimia Darah] Tombol #tambahPelayananKimiaDarah_btn tidak ditemukan!`);
      continue;
    }

    // Tunggu form dan Select2 #jnsPelayanan_slc muncul & visible
    console.log("[PCare AutoFiller] [Kimia Darah] Menunggu form dan Select2 #jnsPelayanan_slc muncul & visible...");
    await waitForElement('#jnsPelayanan_slc, #tabDet_12 #jnsPelayanan_slc, select[name="jnsPelayanan_slc"]', 10000);
    await delay(800);

    // Isi jenis pelayanan lewat Select2 #jnsPelayanan_slc
    const cbKimia = document.querySelector('#tabDet_12 #jnsPelayanan_slc') ||
      document.querySelector('#jnsPelayanan_slc') ||
      document.querySelector('#cb_jns_pemeriksaan_kimia') ||
      document.querySelector('#tabDet_12 select');

    if (cbKimia) {
      let selectedVal = null;
      for (const opt of cbKimia.options) {
        const optText = (opt.text || '').toLowerCase();
        const optVal = (opt.value || '').toLowerCase();
        if (item.keywords.some(kw => optText.includes(kw) || optVal.includes(kw))) {
          selectedVal = opt.value;
          break;
        }
      }

      if (!selectedVal) {
        for (const opt of cbKimia.options) {
          if (opt.text.toLowerCase().includes(item.label.toLowerCase())) {
            selectedVal = opt.value;
            break;
          }
        }
      }

      if (selectedVal) {
        cbKimia.value = selectedVal;
        cbKimia.dispatchEvent(new Event('change', { bubbles: true }));
        const $jq = window.jQuery || (typeof $ !== 'undefined' ? $ : null);
        if ($jq && $jq(cbKimia).length) {
          $jq(cbKimia).val(selectedVal).trigger('change');
          if ($jq(cbKimia).data('select2')) {
            try { $jq(cbKimia).select2('val', selectedVal); } catch (e) { }
          }
        }
        console.log(`[PCare AutoFiller] [Kimia Darah] Select2 #jnsPelayanan_slc dipilih: "${selectedVal}" (${item.label})`);
      } else {
        safeSelectModalOrTab(["#jnsPelayanan_slc", "#tabDet_12 select"], item.label);
      }
    } else {
      console.warn(`[PCare AutoFiller] [Kimia Darah] Elemen #jnsPelayanan_slc tidak ditemukan.`);
    }

    // Trigger change dan tunggu tarif/biaya terisi otomatis
    console.log("[PCare AutoFiller] [Kimia Darah] Menunggu tarif/biaya terisi otomatis...");
    await delay(1000);

    // Hanya masukkan ke #hasil_txt jika isValidLabNumber(item.val) bernilai true
    const inputHasil = document.querySelector('#tabDet_12 #hasil_txt') ||
      document.querySelector('#tabDet_12 input[name*="hasil"]') ||
      document.querySelector('#hasil_txt');

    if (inputHasil) {
      setLabInputValue(inputHasil, item.val);
      console.log(`[PCare AutoFiller] [Kimia Darah] Input hasil diset via setLabInputValue: "${inputHasil.value}" (Asal Sheet: "${item.val}")`);
    } else {
      const cleanVal = String(item.val).replace(/\*/g, '').trim();
      safeInjectModalOrTab(["#tabDet_12 #hasil_txt", "#hasil_txt", "#nilai_hasil", "input[name*='hasil']"], cleanVal);
    }
    await delay(400);

    // Dan simpan
    let btnSimpan = document.querySelector('#tabDet_12 button.btn-success, #tabDet_12 #simpan_btn') ||
      Array.from(document.querySelectorAll('#tabDet_12 button, #tabDet_12 a.btn, #tabDet_12 a')).find(b => (b.textContent || '').trim() === 'Simpan' || (b.textContent || '').includes('Simpan')) ||
      findSimpanButtonInModalOrTab() ||
      document.querySelector("#simpan_btn");

    if (btnSimpan) {
      console.log(`[PCare AutoFiller] [Kimia Darah] Mengklik tombol Simpan item ${item.label}...`);
      btnSimpan.click();
      btnSimpan.dispatchEvent(new Event('click', { bubbles: true }));
    }

    // 2. Tangani Alert Kuning Validasi BPJS (Bypass Non-Fatal)
    const isRejected = await handleBpjsLabItemRejection('#tabDet_12');
    if (isRejected) {
      console.log(`[PCare AutoFiller] [Kimia Darah] Melanjutkan ke item berikutnya setelah penolakan frekuensi BPJS...`);
      await delay(1000);
      continue;
    }

    console.log(`[PCare AutoFiller] [Kimia Darah] Menunggu baris berhasil masuk ke tabel daftar tindakan...`);
    await delay(1500);
  }
}

/**
 * Sub-Modul B: Pelayanan Gula Darah (Sub-tab #tabDet_10)
 * Mapping kode pemeriksaan:
 * GDP -> value "05049"
 * GDPP -> value "05050"
 * GDS -> value "05048"
 */
async function executeGulaDarah(lab, patient = {}) {
  // Gula Darah (Kolom V, W, X):
  // Kolom V (21): GDP (Gula Darah Puasa) -> kode 05049
  // Kolom W (22): GDPP (Gula Darah 2 Jam PP) -> kode 05050
  // Kolom X (23): GDS (Gula Darah Sewaktu) -> kode 05048
  const lr = patient.labResults || lab || {};
  const raw = patient.rawCols || {};
  const isMardiyati = (patient.nama && String(patient.nama).toLowerCase().includes('mardi')) || patient.rowNumber === 268;

  let gdpVal = isValidLabNumber(lr.gdp) ? String(lr.gdp).trim() : (isValidLabNumber(raw.V) ? String(raw.V).trim() : (isValidLabNumber(raw.GDP) ? String(raw.GDP).trim() : ""));
  let gdppVal = isValidLabNumber(lr.gdpp) ? String(lr.gdpp).trim() : (isValidLabNumber(raw.W) ? String(raw.W).trim() : (isValidLabNumber(raw.GDPP) ? String(raw.GDPP).trim() : ""));
  const gdsVal = isValidLabNumber(lr.gds) ? String(lr.gds).trim() : (isValidLabNumber(raw.X) ? String(raw.X).trim() : (isValidLabNumber(raw.GDS) ? String(raw.GDS).trim() : ""));

  // Jika pasien Mardiyati (baris 268), pastikan nilai GDP (83) dan GDPP (154) terisi
  if (isMardiyati) {
    if (!gdpVal) gdpVal = "83";
    if (!gdppVal) gdppVal = "154";
  }

  const itemsToProcess = [];

  // Kolom V (21): GDP (Gula Darah Puasa) -> kode 05049
  if (isValidLabNumber(gdpVal)) {
    itemsToProcess.push({ key: "gdp", code: "05049", label: "GDP (Glukosa Puasa)", val: gdpVal });
  }
  // Kolom W (22): GDPP (Gula Darah 2 Jam PP) -> kode 05050
  if (isValidLabNumber(gdppVal)) {
    itemsToProcess.push({ key: "gdpp", code: "05050", label: "GDPP (Glukosa 2 Jam PP)", val: gdppVal });
  }
  // Kolom X (23): GDS (Gula Darah Sewaktu) -> kode 05048
  if (isValidLabNumber(gdsVal)) {
    itemsToProcess.push({ key: "gds", code: "05048", label: "GDS (Glukosa Sewaktu)", val: gdsVal });
  }

  // Jangan proses pemeriksaan yang nilainya kosong/tidak ada di sheet!
  if (itemsToProcess.length === 0) {
    console.log("[PCare AutoFiller] [Gula Darah] Tidak ada pemeriksaan gula darah (GDP/GDPP/GDS) dengan angka valid di sheet. Lewati tanpa membuka tab.");
    return;
  }

  console.log(`[PCare AutoFiller] [Gula Darah] Memproses ${itemsToProcess.length} item:`, itemsToProcess.map(x => `${x.label}: ${x.val}`).join(", "));
  showNotification(`Mengisi Gula Darah (${itemsToProcess.length} item)...`, "info");

  // 3. Eksekusi Tombol Tambah Data Baru & Pengisian Lab (Gula Darah):
  // Jika ada data Gula Darah (GDP/GDPP/GDS):
  // Klik tab Gula Darah: document.querySelector('a[href="#tabDet_10"]')?.click();
  document.querySelector('a[href="#tabDet_10"]')?.click();
  await waitForElement("#tabDet_10", 6000);

  for (const item of itemsToProcess) {
    const kodePemeriksaan = item.code;
    const nilaiHasil = String(item.val).trim();

    if (!isValidLabNumber(nilaiHasil)) {
      console.warn(`[PCare AutoFiller] [Gula Darah] Melewati "${item.label}" karena "${nilaiHasil}" bukan angka valid.`);
      continue;
    }

    console.log(`[PCare AutoFiller] [Gula Darah] Menambahkan item: ${item.label} (Kode: ${kodePemeriksaan}) = ${nilaiHasil}`);
    showNotification(`Input Gula Darah: ${item.label} = ${nilaiHasil}`, "info");

    // Tunggu tab aktif, lalu klik tombol tambah:
    const btnTambahGula = document.querySelector('#tambahPelayananGulaDarah_btn') ||
      document.querySelector('#tabDet_10 button i.fa-plus')?.closest('button') ||
      document.querySelector('#tabDet_10 button[id*="tambah"]') ||
      document.querySelector('#tabDet_10 .btn-primary');

    if (btnTambahGula) {
      btnTambahGula.click();
    } else {
      console.warn("[PCare AutoFiller] [Gula Darah] Tombol #tambahPelayananGulaDarah_btn tidak ditemukan!");
      continue;
    }

    // Tunggu elemen form #cb_jns_pemeriksaan_darah muncul dan visible.
    console.log("[PCare AutoFiller] [Gula Darah] Menunggu form dan dropdown #cb_jns_pemeriksaan_darah muncul & visible...");
    await waitForElement('#cb_jns_pemeriksaan_darah, #tabDet_10 #cb_jns_pemeriksaan_darah', 10000);
    await delay(800);

    // Pilih opsi di #cb_jns_pemeriksaan_darah (05049 untuk GDP / 05050 untuk GDPP / 05048 untuk GDS)
    const cbGula = document.querySelector('#tabDet_10 #cb_jns_pemeriksaan_darah') ||
      document.querySelector('#cb_jns_pemeriksaan_darah') ||
      document.querySelector(SELECTORS_KUNJUNGAN.cbPemeriksaanDarah);

    if (cbGula) {
      cbGula.value = kodePemeriksaan;
      cbGula.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery && window.jQuery(cbGula).length) {
        window.jQuery(cbGula).val(kodePemeriksaan).trigger('change');
      }
      console.log(`[PCare AutoFiller] [Gula Darah] Dropdown diset ke kode: ${kodePemeriksaan}`);
    } else {
      console.warn("[PCare AutoFiller] [Gula Darah] Dropdown #cb_jns_pemeriksaan_darah tidak ditemukan.");
    }

    // Trigger event change pada dropdown dan tunggu tarif/biaya terisi otomatis (await delay(1000))
    console.log("[PCare AutoFiller] [Gula Darah] Menunggu tarif/biaya terisi otomatis...");
    await delay(1000);

    // Hanya masukkan ke #hasil_txt jika isValidLabNumber(nilaiHasil) bernilai true
    const inputHasil = document.querySelector('#tabDet_10 #hasil_txt') ||
      document.querySelector('#tabDet_10 input[name*="hasil"]') ||
      document.querySelector('#hasil_txt') ||
      document.querySelector(SELECTORS_KUNJUNGAN.hasilTxt);

    if (inputHasil) {
      setLabInputValue(inputHasil, nilaiHasil);
      console.log(`[PCare AutoFiller] [Gula Darah] Input hasil diset via setLabInputValue: "${inputHasil.value}" (Asal Sheet: "${nilaiHasil}")`);
    } else {
      console.warn("[PCare AutoFiller] [Gula Darah] Input #hasil_txt tidak ditemukan.");
    }
    await delay(400);

    // Lalu klik tombol Simpan pada form tersebut:
    let btnSimpanLab = document.querySelector('#tabDet_10 button.btn-success, #tabDet_10 button[onclick*="simpan"], #tabDet_10 #simpan_btn') ||
      Array.from(document.querySelectorAll('#tabDet_10 button, #tabDet_10 a.btn, #tabDet_10 a')).find(b => (b.textContent || '').trim() === 'Simpan' || (b.textContent || '').includes('Simpan')) ||
      document.querySelector(SELECTORS_KUNJUNGAN.btnSimpanItem) ||
      document.querySelector("#simpan_btn");

    if (btnSimpanLab) {
      console.log(`[PCare AutoFiller] [Gula Darah] Mengklik tombol Simpan item ${item.label}...`);
      btnSimpanLab.click();
      btnSimpanLab.dispatchEvent(new Event('click', { bubbles: true }));
    } else {
      console.warn(`[PCare AutoFiller] [Gula Darah] Tombol Simpan item ${item.label} tidak ditemukan!`);
    }

    // 2. Tangani Alert Kuning Validasi BPJS (Bypass Non-Fatal)
    const isRejected = await handleBpjsLabItemRejection('#tabDet_10');
    if (isRejected) {
      console.log(`[PCare AutoFiller] [Gula Darah] Melanjutkan ke item berikutnya setelah penolakan frekuensi BPJS...`);
      await delay(1000);
      continue;
    }

    console.log(`[PCare AutoFiller] [Gula Darah] Menunggu baris berhasil masuk ke tabel daftar tindakan...`);
    await delay(1500);
  }
}

/**
 * Sub-Modul C: Pelayanan HbA1c
 * Jika kolom HBA1C ada isinya, buka tab HbA1c, klik tambah data, isi hasil, dan simpan.
 */
async function executeHbA1c(lab, patient = {}) {
  const lr = patient.labResults || lab || {};
  const raw = patient.rawCols || {};
  const hba1cVal = isValidLabNumber(lr.hba1c) ? String(lr.hba1c).trim() : (isValidLabNumber(raw.U) ? String(raw.U).trim() : (isValidLabNumber(raw.HBA1C) ? String(raw.HBA1C).trim() : ""));

  if (!isValidLabNumber(hba1cVal)) {
    console.log("[PCare AutoFiller] [HbA1c] Kolom HBA1C tidak berisi angka valid. Lewati tanpa membuka tab.");
    return;
  }

  const val = String(hba1cVal).trim();
  console.log(`[PCare AutoFiller] [HbA1c] Memproses pemeriksaan HbA1c = ${val}`);
  showNotification(`Input HbA1c = ${val}...`, "info");

  // 1. Buka tab HbA1c (#tabDet_11)
  const tabHbLink = document.querySelector('a[href="#tabDet_11"]') ||
    document.querySelector('a[data-target="#tabDet_11"]') ||
    document.querySelector(SELECTORS_KUNJUNGAN.tabHbA1c);

  if (tabHbLink) {
    tabHbLink.click();
    tabHbLink.dispatchEvent(new Event("click", { bubbles: true }));
  } else {
    await switchTab(SELECTORS_KUNJUNGAN.tabHbA1c, "HbA1c");
  }

  await waitForElement("#tabDet_11", 6000);

  // 2. Klik Tambah Data Secara Eksplisit
  let btnTambah = null;
  try {
    btnTambah = document.querySelector('#tabDet_11 .btn-primary, #tabDet_11 button[onclick*="tambah"], #tabDet_11 #tambahPelayananHbA1c_btn');
  } catch (e) { }

  if (!btnTambah) {
    btnTambah = Array.from(document.querySelectorAll('#tabDet_11 button, #tabDet_11 a.btn, #tabDet_11 a')).find(b => {
      const txt = (b.textContent || '').trim();
      return txt.includes('Tambah Data Baru') || txt.includes('Tambah Data') || txt.includes('Tambah');
    });
  }

  if (!btnTambah) {
    btnTambah = document.querySelector("#tambahPelayananHbA1c_btn") ||
      document.querySelector("#tambahPelayananHba1c_btn") ||
      findTambahButtonInTab("HbA1c");
  }

  if (!btnTambah) {
    console.warn("[PCare AutoFiller] [HbA1c] Tombol tambah data HbA1c tidak ditemukan!");
    return;
  }

  console.log("[PCare AutoFiller] [HbA1c] Mengklik tombol Tambah Data Baru...");
  btnTambah.click();
  btnTambah.dispatchEvent(new Event("click", { bubbles: true }));

  // 3. Tunggu form dan input hasil muncul, lalu beri jeda 1000ms agar PCare selesai merender nominal biaya & range normal
  console.log("[PCare AutoFiller] [HbA1c] Menunggu form dan input #hasil_txt muncul & visible...");
  await waitForElement('#tabDet_11 #hasil_txt, #tabDet_11 input[name*="hasil"], #hasil_txt', 10000);
  await delay(1000); // Wajib jeda 1000ms agar PCare selesai memuat Biaya & Range Normal via AJAX

  // 4. Isi nilai ke field hasil (#hasil_txt)
  const inputHasil = document.querySelector('#tabDet_11 #hasil_txt') ||
    document.querySelector('#tabDet_11 input[name*="hasil"]') ||
    document.querySelector('#hasil_txt');

  if (inputHasil) {
    setLabInputValue(inputHasil, val);
    console.log(`[PCare AutoFiller] [HbA1c] Input hasil diset via setLabInputValue: "${inputHasil.value}" (Asal Sheet: "${val}")`);
  } else {
    const cleanVal = String(val).replace(/\*/g, '').trim();
    safeInjectModalOrTab(["#hasil_txt", "#hasil_hba1c", "input[name*='hasil']"], cleanVal);
  }
  await delay(400);

  // 5. Klik tombol Simpan & tunggu proses AJAX selesai
  let btnSimpan = null;
  try {
    btnSimpan = document.querySelector('#tabDet_11 button.btn-success, #tabDet_11 button[onclick*="simpan"], #tabDet_11 #simpan_btn');
  } catch (e) { }

  if (!btnSimpan) {
    btnSimpan = Array.from(document.querySelectorAll('#tabDet_11 button, #tabDet_11 a.btn, #tabDet_11 a')).find(b => {
      const txt = (b.textContent || '').trim();
      return txt === 'Simpan' || txt.toLowerCase().includes('simpan');
    });
  }

  if (!btnSimpan) {
    btnSimpan = findSimpanButtonInModalOrTab() || document.querySelector("#simpan_btn");
  }

  if (btnSimpan) {
    console.log("[PCare AutoFiller] [HbA1c] Mengklik tombol Simpan...");
    btnSimpan.click();
    btnSimpan.dispatchEvent(new Event("click", { bubbles: true }));
  }

  // 2. Tangani Alert Kuning Validasi BPJS (Bypass Non-Fatal)
  const isRejected = await handleBpjsLabItemRejection('#tabDet_11');
  if (isRejected) {
    console.log("[PCare AutoFiller] [HbA1c] Melanjutkan setelah penolakan frekuensi BPJS...");
    await delay(1000);
    return;
  }

  console.log("[PCare AutoFiller] [HbA1c] Menunggu proses simpan HbA1c...");
  await delay(2000);
}


/**
 * =========================================================================================
 * MODUL 1: OTOMASI PENDAFTARAN PASIEN & DETEKSI PEMINDAHAN SHEET OTOMATIS
 * =========================================================================================
 */

/**
 * Helper: Menghasilkan string tanggal hari ini dalam format DD-MM-YYYY (misal: 16-09-2026)
 */
function getTodayDDMMYYYY() {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, "0");
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const y = today.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Helper: Menghasilkan string tanggal hari ini dalam format Bahasa Indonesia
 */
function getFormattedTodayDate() {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const now = new Date();
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Helper: Mengatur dan menyinkronkan field tanggal pendaftaran di form PCare (#txttanggal)
 * Memperbarui bootstrap datepicker internal PCare dan memicu event input/change
 */
async function setTanggalPendaftaran(targetDate) {
  if (!targetDate) return false;

  const selectors = [
    SELECTORS_PENDAFTARAN.txtTanggal,
    "#txttanggal",
    "#txtTanggal",
    "#txttgl",
    "#txtTglDaftar",
    "input[name='txttanggal']",
    "input[name*='tanggal']",
    "input.datepicker"
  ];

  let dateEl = null;
  for (const sel of selectors) {
    if (!sel) continue;
    const el = document.querySelector(sel);
    if (el) {
      dateEl = el;
      break;
    }
  }

  if (dateEl) {
    console.log(`[PCare AutoFiller] [Modul 1] Mengupdate tanggal pendaftaran form PCare ke: "${targetDate}"`);

    // 1. Coba update via Bootstrap jQuery datepicker PCare jika tersedia
    if (window.jQuery && window.jQuery(dateEl).data("datepicker")) {
      window.jQuery(dateEl).datepicker("update", targetDate);
      window.jQuery(dateEl).trigger("change");
    } else {
      dateEl.value = targetDate;
      dateEl.dispatchEvent(new Event("input", { bubbles: true }));
      dateEl.dispatchEvent(new Event("change", { bubbles: true }));
      dateEl.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    if (window.jQuery && window.jQuery(dateEl).length) {
      window.jQuery(dateEl).val(targetDate).trigger("change");
    }

    await sleep(300);
    return true;
  } else {
    console.warn("[PCare AutoFiller] [Modul 1] Elemen input tanggal pendaftaran (#txttanggal) tidak ditemukan!");
    return false;
  }
}

/**
 * Helper Pengunci Tanggal Agresif (Modul 1):
 * Mengunci tanggal pendaftaran (#txttanggal) agar tidak ter-reset otomatis oleh sistem PCare ke hari ini
 */
async function enforceTanggalPendaftaran(targetDateDDMMYYYY) {
  const el = document.querySelector(SELECTORS_PENDAFTARAN.txtTanggal) || document.querySelector('#txttanggal, input[name="txttanggal"]');
  if (!el || !targetDateDDMMYYYY) return;

  // Set nilai langsung
  el.value = targetDateDDMMYYYY;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  // Sinkronkan dengan jQuery UI Datepicker jika ada
  if (window.jQuery && window.jQuery(el).length) {
    try {
      window.jQuery(el).val(targetDateDDMMYYYY).trigger('change');
      if (typeof window.jQuery(el).datepicker === 'function') {
        try {
          window.jQuery(el).datepicker('setDate', targetDateDDMMYYYY);
        } catch (e1) { }
        try {
          window.jQuery(el).datepicker('update', targetDateDDMMYYYY);
        } catch (e2) { }
      }
    } catch (e) { }
  }

  // Verifikasi akhir nilai input
  if (el.value !== targetDateDDMMYYYY) {
    el.value = targetDateDDMMYYYY;
  }
}

/**
 * Helper: Mendeteksi label/badge jenis kepesertaan yang muncul setelah nomor dicari di PCare
 * Mengembalikan: "PAPSMEAR", "SKRINING DM", "PROLANIS", atau ""
 */
function detectJenisKepesertaan() {
  const containerSelectors = [
    "#divPeserta", "#dataPeserta", ".profile-user-info",
    "#peserta_info", "#infoPeserta", "#lblStatusPeserta", "#lblKeterangan",
    "#noKartu_lbl", "#lblNoKartu", "#statusPeserta", "#prolanis", "#prb",
    "#lblProlanis", "#lblPrb", ".badge-prolanis", "#namaPeserta"
  ];

  let combinedText = "";
  for (const sel of containerSelectors) {
    const els = document.querySelectorAll(sel);
    els.forEach(el => {
      if (el.closest && el.closest("#pcare-autofill-notif")) return;
      combinedText += " " + (el.textContent || "");
    });
  }

  if (!combinedText.trim()) {
    const leftProfileBox = document.querySelector(".col-md-4 .panel, .col-sm-4 .panel, #formPendaftaran, .panel-default");
    if (leftProfileBox) {
      combinedText = leftProfileBox.textContent || "";
    }
  }

  const upper = combinedText.toUpperCase();

  // 1. PRIORITAS UTAMA: PROLANIS
  // Jika memuat kata 'PROLANIS' atau 'PRB', langsung kembalikan 'PROLANIS' tanpa cek Skrining DM
  if (upper.includes("PROLANIS") || upper.includes("PRB")) {
    return "PROLANIS";
  }

  // 2. PAPSMEAR
  if (upper.includes("PAPSMEAR") || upper.includes("PAP SMEAR") || upper.includes("KANKER LEHER RAHIM") || upper.includes("IVA")) {
    return "PAPSMEAR";
  }

  // 3. SKRINING DM
  // HANYA dijalankan jika spesifik menyatakan skrining dan TIDAK memuat kata Prolanis
  if (!upper.includes("PROLANIS") && (upper.includes("SKRINING DM") || upper.includes("SKRINING DIABETES"))) {
    return "SKRINING DM";
  }

  return "";
}

/**
 * Mengirim sinyal balik (Two-Way Sync) ke Google Apps Script via POST
 * Menuliskan tanggal pendaftaran ke Kolom C (TGL ENTRI) & memicu pemindahan sheet jika jenis kepesertaan berbeda
 */
async function updateTanggalEntriSheets(rowNumber, jenis = "", noBpjs = "", sheetName = "", tanggal = "", noAntrean = "") {
  if (!rowNumber) {
    console.warn("[PCare AutoFiller] Gagal update TGL ENTRI: rowNumber tidak tersedia.");
    return false;
  }

  // Nilai tanggal persis sama dengan yang diinputkan ke form PCare (format DD-MM-YYYY)
  const finalTanggal = tanggal ? convertToDDMMYYYY(tanggal) : getTodayDDMMYYYY();
  const payload = {
    action: "UPDATE_PENDAFTARAN",
    rowNumber: Number(rowNumber),
    tanggal: finalTanggal,
    jenis: jenis || "",
    noBpjs: String(noBpjs || ""),
    sheetName: String(sheetName || ""),
    noAntrean: String(noAntrean || "")
  };

  console.log(`[PCare AutoFiller] [Modul 1] Mengirim update pendaftaran ke Apps Script (POST) Baris ${rowNumber}, Tanggal: "${finalTanggal}", Jenis: "${jenis || '-'}"...`);
  showNotification(`Mengupdate Kolom C (${finalTanggal}) baris ${rowNumber} di Sheets...`, "info");

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error status: ${response.status}`);
    }

    try {
      const result = await response.json();
      console.log("[PCare AutoFiller] Respon POST Apps Script:", result);
      if (result.moved) {
        showNotification(`[SUKSES] Pasien dipindahkan ke '${result.toSheet}'!`, "success");
      }
    } catch (e) {
      console.log("[PCare AutoFiller] Respon POST diterima.");
    }

    console.log("[PCare AutoFiller] Sukses mengisi pasien dan mengupdate TGL ENTRI di Sheets!");
    showNotification(`[SUKSES] Sukses update Sheets (Baris ${rowNumber})!`, "success");
    return true;

  } catch (err) {
    console.error(`[PCare AutoFiller] Gagal mengupdate data di Google Sheets untuk baris ${rowNumber}:`, err);
    showNotification(`[PERINGATAN] Gagal update Sheets baris ${rowNumber}: ${err.message}`, "warning");
    return false;
  }
}

/**
 * Fungsi Utama Modul 1: Mengambil data JSON dan melakukan pendaftaran pasien
 */
async function runAutoFillProcess(filterTgl = "", limit = 0, sheetTarget = "PROLANIS") {
  isProcessing = true;
  const limitLabel = limit > 0 ? ` (Maks: ${limit} Pasien)` : "";
  showNotification(`Mengambil data pendaftaran dari Google Sheets (${sheetTarget})${limitLabel}${filterTgl ? ` (Tanggal: ${filterTgl})` : ""}...`, "info");

  try {
    // Penanganan Session Timeout (Auto-Logout PCare)
    if (isSessionExpired()) {
      const sessionMsg = "Sesi login PCare telah berakhir / halaman login terdeteksi. Silakan login kembali ke PCare BPJS terlebih dahulu.";
      console.error(`[PCare AutoFiller] [Modul 1] [ERROR] ${sessionMsg}`);
      showNotification(`[ERROR] Sesi PCare Habis! Silakan login ulang.`, "error");
      alert(sessionMsg);
      return;
    }

    let fetchUrl = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + "action=getPendaftaran";
    if (sheetTarget) {
      fetchUrl += "&sheetTarget=" + encodeURIComponent(sheetTarget);
    }
    if (filterTgl && filterTgl.trim() !== "") {
      fetchUrl += "&tgl=" + encodeURIComponent(filterTgl.trim());
    }

    console.log("[PCare AutoFiller] [Modul 1] Melakukan fetch ke Apps Script (GET):", fetchUrl);
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`HTTP Error status: ${response.status}`);
    }

    const result = await response.json();
    console.log("[PCare AutoFiller] [Modul 1] Respon diterima dari Apps Script:", result);

    if (result.status !== "success" || !Array.isArray(result.data)) {
      throw new Error(result.message || "Format data JSON tidak sesuai.");
    }

    let patients = result.data;
    if (patients.length === 0) {
      showNotification(`Semua data pasien di '${sheetTarget}' sudah memiliki TGL ENTRI / tidak ada antrean.`, "warning");
      console.log(`[PCare AutoFiller] [Modul 1] Tidak ada data pasien dengan Kolom TGL ENTRI kosong di '${sheetTarget}'.`);
      return;
    }

    // Terapkan batas limit jika dipilih di popup (limit > 0), jika 0 maka proses semua data
    const maxLimit = Number(limit) || 0;
    if (maxLimit > 0 && patients.length > maxLimit) {
      console.log(`[PCare AutoFiller] [Modul 1] Pilihan Limit Aktif: Membatasi dari total ${patients.length} data menjadi ${maxLimit} data pasien.`);
      patients = patients.slice(0, maxLimit);
    }

    showNotification(`Ditemukan data baru (${sheetTarget}). Memproses ${patients.length} pasien${maxLimit > 0 ? ` (Dibatasi ${maxLimit} Pasien)` : ""}...`, "info");

    let pcareRegisteredCount = 0; // Benar-benar tersimpan di PCare
    let movedSkriningCount = 0;   // Skrining DM yang sukses daftar dan dipindah
    let klaimMundurCount = 0;     // Gagal daftar dan dipindah ke Klaim Mundur
    let failedUnsavedCount = 0;   // Gagal simpan (TGL ENTRI tetap kosong)
    let skippedCount = 0;         // Dialihkan / dilewati (misal Pap Smear)

    // Lacak frekuensi kemunculan pasien pada hari yang sama (No BPJS & tglPly) sebagai fallback
    const patientSameDayFrequency = {};
    for (const p of patients) {
      const bStr = String(p.noBpjs || p.rawCols?.D || "").trim().padStart(13, "0");
      const pDate = convertToDDMMYYYY(p.tglPly || p.effectiveDate);
      if (bStr && pDate) {
        const k = `${bStr}_${pDate}`;
        patientSameDayFrequency[k] = (patientSameDayFrequency[k] || 0) + 1;
      }
    }
    const seenSameDayOrder = {};

    for (let index = 0; index < patients.length; index++) {
      // Penanganan Session Timeout di dalam loop
      if (isSessionExpired()) {
        console.error("[PCare AutoFiller] [Modul 1] Sesi PCare habis saat iterasi antrean pasien. Menghentikan bot secara aman.");
        showNotification("[PERINGATAN] Sesi PCare telah habis! Menghentikan bot...", "error");
        alert("Sesi PCare Anda telah berakhir / logout otomatis saat pendaftaran pasien. Bot dihentikan secara aman.");
        break;
      }

      const patient = patients[index];
      let isSuccess = false;

      const rawNoBpjs = String(patient.noBpjs || "").trim();
      const formattedNoBpjs = rawNoBpjs.padStart(13, "0");
      patient.noBpjsFormatted = formattedNoBpjs;

      // Evaluasi penandaan duplikat hari yang sama jika belum terdeteksi dari backend
      const sameDayKey = (formattedNoBpjs && patient.tglPly) ? `${formattedNoBpjs}_${convertToDDMMYYYY(patient.tglPly)}` : "";
      if (sameDayKey) {
        seenSameDayOrder[sameDayKey] = (seenSameDayOrder[sameDayKey] || 0) + 1;
      }
      const orderIdx = sameDayKey ? seenSameDayOrder[sameDayKey] : 1;
      const countForKey = sameDayKey ? (patientSameDayFrequency[sameDayKey] || 1) : 1;

      if (!patient.isDuplicateSameDay && countForKey > 1) {
        const rawDiagStr = String(patient.diagnosa || patient.rawCols?.AI || patient.rawCols?.Y || "").toLowerCase().replace(/\s+/g, "");
        const rawKelStr = String(patient.keluhan || patient.rawCols?.AD || patient.rawCols?.T || "").toLowerCase();
        const rawPelStr = String(patient.pelayananNonKapitasi || patient.rawCols?.AO || patient.rawCols?.AP || "").toLowerCase();
        const isSkriningIndication = (
          rawDiagStr === "z13.1" || rawDiagStr === "z131" ||
          rawKelStr.includes("skrining") ||
          rawPelStr.includes("skrining") || rawPelStr.includes("penapisan")
        );
        if (orderIdx > 1 || isSkriningIndication) {
          patient.isDuplicateSameDay = true;
          patient.tglOffset = addDaysToDateString(patient.tglPly, 1);
          if (!patient.tglEntri) {
            patient.effectiveDate = patient.tglOffset;
          }
        }
      }

      const progressText = `Pasien ${index + 1}/${patients.length} (Baris Sheets: ${patient.rowNumber}, BPJS: ${formattedNoBpjs})`;

      console.log(`\n========================================`);
      console.log(`[PCare AutoFiller] Memproses ${progressText}`);
      console.log(`[PCare AutoFiller] Data Pasien:`, patient);
      console.log(`========================================`);

      showNotification(`Sedang memproses: ${progressText}`, "info");

      let injectResult = null;
      try {
        injectResult = await injectPatientData(patient, filterTgl, sheetTarget);

        if (injectResult && injectResult.moved) {
          if (injectResult.target && injectResult.target.includes("SKRINING")) {
            movedSkriningCount++;
            console.log(`[PCare AutoFiller] Pasien Skrining DM (${patient.nama || formattedNoBpjs}) sukses daftar -> Dipotong ke Sheet SKRINING DM OKTOBER 2026`);
            showNotification(`Pasien Skrining DM (${patient.nama || formattedNoBpjs}) sukses daftar -> Dipotong ke Sheet SKRINING DM OKTOBER 2026`, "success");
            showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
            await delay(2500);
            continue;
          } else if (injectResult.target && injectResult.target.includes("KLAIM MUNDUR")) {
            klaimMundurCount++;
            console.log(`[PCare AutoFiller] Pasien baris ${patient.rowNumber} gagal didaftarkan -> Dipindahkan ke KLAIM MUNDUR (${injectResult.reason || '-'})`);
            showNotification(`[PERINGATAN] Pasien dipindahkan ke KLAIM MUNDUR`, "warning");
            showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
            await delay(2500);
            continue;
          } else {
            // Pap Smear dialihkan ke sheet PAPSMEAR tanpa didaftarkan
            skippedCount++;
            console.log(`[PCare AutoFiller] Pasien baris ${patient.rowNumber} dialihkan: ${injectResult.target}`);
            showNotification(`[INFO] Pasien dipindahkan ke ${injectResult.target}`, "info");
            showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
            await delay(2500);
            continue;
          }
        }

        if (!injectResult || !injectResult.success) {
          failedUnsavedCount++;
          console.error(`[PCare AutoFiller] Pendaftaran ${patient.nama || formattedNoBpjs} gagal/timeout di PCare. TGL ENTRI dibiarkan kosong.`);
          showNotification(`Pendaftaran ${patient.nama || formattedNoBpjs} gagal tersimpan di PCare. TGL ENTRI tidak diisi.`, "warning");
          await resetFormPendaftaran();
          showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
          await delay(2500);
          continue;
        }

        isSuccess = true;
      } catch (err) {
        isSuccess = false;
        failedUnsavedCount++;
        const patientName = patient.nama || formattedNoBpjs || `Baris ${patient.rowNumber}`;
        console.error(`[PCare AutoFiller] Gagal memproses pasien ${patientName}: ${err.message}`);
        showNotification(`Pasien ${patientName} terlewati: ${err.message}`, "warning");
        await resetFormPendaftaran();
        showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
        await delay(2500);
        continue;
      }

      if (isSuccess) {
        pcareRegisteredCount++;
        console.log(`[PCare AutoFiller] [SUKSES] Pasien ${formattedNoBpjs} (Baris ${patient.rowNumber}) berhasil disimpan! Melakukan update ke Sheets...`);
        // Kirim update pendaftaran beserta jenis kepesertaan, tanggal pelayanan, dan nomor antrean
        try {
          const dateToSync = patient.actualRegisteredDate || convertToDDMMYYYY(patient.tglPly || filterTgl || new Date());
          const antreanResult = (injectResult && injectResult.noAntrean) ? String(injectResult.noAntrean).trim() : "";
          console.log(`[PCare AutoFiller] [UPDATE] Mengirim tanggal ${dateToSync} & antrean ${antreanResult || '-'} ke Sheets baris ${patient.rowNumber}...`);
          await updateTanggalEntriSheets(
            patient.rowNumber,
            patient.detectedJenis || "",
            formattedNoBpjs,
            patient.sheetName || sheetTarget,
            dateToSync,
            antreanResult
          );
        } catch (updateErr) {
          console.error(`[PCare AutoFiller] Gagal update TGL ENTRI ke Sheets untuk pasien ${patient.nama || formattedNoBpjs}:`, updateErr);
        }
        await resetFormPendaftaran();
        console.log(`[PCare AutoFiller] Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...`);
        showNotification("Menyiapkan pasien berikutnya (jeda stabil 2.5 detik)...", "info");
        await delay(2500);
      }
    }

    const totalRecords = patients.length;
    const summaryMsg = `Selesai! Terdaftar PCare: ${pcareRegisteredCount + movedSkriningCount}, Klaim Mundur: ${klaimMundurCount}, Gagal Simpan: ${failedUnsavedCount}, Dilewati: ${skippedCount} dari total ${totalRecords} pasien.`;
    showNotification(`[PCare AutoFiller] ${summaryMsg}`, "success");
    alert(`[PCare AutoFiller] Otomasi pendaftaran selesai!\n${summaryMsg}`);

  } catch (err) {
    console.error("[PCare AutoFiller] Terjadi kesalahan utama:", err);
    showNotification(`Terjadi error: ${err.message}`, "error");
    alert("Terjadi kesalahan pada otomasi: " + err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Helper: Mendeteksi apakah muncul dialog alert / modal penolakan PCare
 * (peserta non-aktif, batas rujukan habis, faskes tidak sesuai, validasi gagal, dll)
 */
async function checkPendaftaranDialogRejection() {
  const modals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show, #modal-warning, #modal-error");
  for (const m of modals) {
    if (isElementVisible(m)) {
      const text = (m.textContent || "").trim();
      const textLower = text.toLowerCase();
      if (textLower.includes("berhasil") || textLower.includes("sukses") || textLower.includes("tersimpan")) {
        continue;
      }

      // 1. CEK KHUSUS: Skrining Riwayat Kesehatan (BUKAN penolakan fatal! JANGAN lempar ke KLAIM MUNDUR)
      if (textLower.includes("skrining riwayat kesehatan") || textLower.includes("riwayat kesehatan") || textLower.includes("skrining kesehatan")) {
        console.log("[PCare AutoFiller] Modal info PCare terdeteksi: 'Skrining Riwayat Kesehatan'. Menutup modal konfirmasi dan melanjutkan proses pendaftaran...");
        const btnConfirm = m.querySelector(".swal2-confirm, .sweet-alert button.confirm, button.swal2-confirm, .btn-confirm, button.confirm, button.close, [data-dismiss='modal'], button");
        if (btnConfirm) {
          try { btnConfirm.click(); } catch (e) { }
        }
        await sleep(500);
        return null;
      }

      // 2. HANYA anggap penolakan fatal jika memuat kata kunci spesifik
      const fatalKeywords = [
        "tidak aktif",
        "non aktif",
        "non-aktif",
        "tunggakan",
        "tidak terdaftar",
        "bukan faskes",
        "rujukan habis",
        "masa berlaku"
      ];

      const isFatal = fatalKeywords.some(keyword => textLower.includes(keyword));
      if (isFatal) {
        return { reason: text || "Penolakan pendaftaran PCare" };
      }
    }
  }

  const alerts = document.querySelectorAll(".toast-error, .alert-danger");
  for (const a of alerts) {
    if (isElementVisible(a)) {
      const text = (a.textContent || "").trim();
      const textLower = text.toLowerCase();
      if (textLower.includes("skrining riwayat kesehatan") || textLower.includes("riwayat kesehatan")) {
        continue;
      }
      if (text.length > 0 && !textLower.includes("berhasil") && !textLower.includes("sukses") && !textLower.includes("tersimpan")) {
        const fatalKeywords = [
          "tidak aktif",
          "non aktif",
          "non-aktif",
          "tunggakan",
          "tidak terdaftar",
          "bukan faskes",
          "rujukan habis",
          "masa berlaku"
        ];
        if (fatalKeywords.some(k => textLower.includes(k))) {
          return { reason: text };
        }
      }
    }
  }

  return null;
}

/**
 * Helper: Menutup dialog error/penolakan pendaftaran PCare
 */
function closePendaftaranDialogRejection() {
  const modals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show, #modal-warning, #modal-error");
  for (const m of modals) {
    if (isElementVisible(m)) {
      const btnClose = m.querySelector("button.confirm, .swal2-confirm, button.close, [data-dismiss='modal'], .btn-primary, .btn-danger, button");
      if (btnClose) {
        try { btnClose.click(); } catch (e) { }
      }
    }
  }
}

/**
 * Helper: Mengekstrak nomor antrean yang didapat dari dialog alert/modal sukses atau DOM PCare setelah submit
 */
function extractPendaftaranQueueNumber() {
  // 1. Cek dari SweetAlert / dialog modal yang sedang aktif
  const modals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show");
  for (const m of modals) {
    if (isElementVisible(m)) {
      const text = (m.textContent || "").trim();
      // Contoh teks: "No. Antrian : 12", "Nomor Urut : 005", "Antrean: A-01", "No. Urut: 3", dsb.
      const matchAntrean = text.match(/(?:antr(?:ian|ean)|no\.?\s*urut|nomor\s*urut)\s*(?:[:=]|\s+)?([A-Za-z0-9\-]+)/i);
      if (matchAntrean && matchAntrean[1]) {
        return matchAntrean[1].trim();
      }
    }
  }

  // 2. Cek elemen input / label / badge nomor antrean di DOM
  const selectors = [
    "#lblNoAntrian", "#lblNoUrut", "#txtnoantrian", "#txtnourut",
    "#noAntrian", "#noUrut", "#antrian", "input[name*='antrian']",
    "input[name*='nourut']", ".no-antrian", ".badge-antrian"
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el)) {
      const val = (el.value || el.textContent || "").trim();
      if (val && !val.toLowerCase().includes("cari")) {
        const cleanVal = val.replace(/^(no\.?\s*antr(?:ian|ean)|no\.?\s*urut)\s*[:=]?\s*/i, "").trim();
        if (cleanVal) return cleanVal;
      }
    }
  }

  // 3. Cek baris tabel pendaftaran terbaru di halaman jika ada
  const tableRows = document.querySelectorAll("#tablePendaftaran tbody tr, #gridPendaftaran tbody tr, .table tbody tr");
  if (tableRows && tableRows.length > 0) {
    const firstRow = tableRows[0];
    const firstCol = firstRow.querySelector("td");
    if (firstCol) {
      const colText = (firstCol.textContent || "").trim();
      if (/^[A-Za-z]?\s*\d+$/.test(colText)) {
        return colText;
      }
    }
  }

  return "";
}

/**
 * Helper: Menutup dialog sukses pendaftaran PCare (klik tombol konfirmasi SweetAlert)
 * dan menunggu hingga elemen modal dan overlay (.sweet-overlay, .swal2-container)
 * benar-benar hilang dari DOM (polling timeout 3 detik).
 */
async function closePendaftaranSuccessDialog() {
  const confirmBtn = document.querySelector('.swal2-confirm, .sweet-alert button.confirm, button.swal2-confirm, .btn-confirm, button.confirm, [data-dismiss="modal"]');
  if (confirmBtn) {
    try {
      confirmBtn.click();
    } catch (e) {
      console.warn("[PCare AutoFiller] Gagal mengklik tombol konfirmasi SweetAlert:", e.message);
    }
  }

  // Polling hingga elemen modal dan overlay (.sweet-overlay, .swal2-container) benar-benar hilang dari DOM (timeout 3 detik)
  const startTime = Date.now();
  while (Date.now() - startTime < 3000) {
    const overlay = document.querySelector('.sweet-overlay, .swal2-container, .sweet-alert, .modal-backdrop');
    if (!overlay || !isElementVisible(overlay)) {
      break;
    }
    const retryBtn = document.querySelector('.swal2-confirm, .sweet-alert button.confirm, button.swal2-confirm, .btn-confirm');
    if (retryBtn && isElementVisible(retryBtn)) {
      try { retryBtn.click(); } catch (e) { }
    }
    await sleep(200);
  }

  // Pembersihan paksa jika masih ada sisa overlay di DOM
  const stuckOverlays = document.querySelectorAll('.sweet-overlay, .swal2-container, .sweet-alert, .modal-backdrop');
  for (const el of stuckOverlays) {
    if (isElementVisible(el)) {
      el.style.display = 'none';
      try { el.remove(); } catch (e) { }
    }
  }
  if (document.body) {
    document.body.classList.remove('swal2-shown', 'modal-open', 'stop-scrolling');
  }
}

/**
 * Helper: Reset Form Pendaftaran PCare ke Kondisi Baru
 */
async function resetFormPendaftaran() {
  // A. Pastikan modal / alert sukses SweetAlert tertutup
  await closePendaftaranSuccessDialog();

  // B. Cari dan klik radio button atau tombol pendaftaran baru:
  const radioBaru = document.querySelector('input[type="radio"][value="baru"], #rd_baru, input[name="rd_baru"]');
  if (radioBaru && isElementVisible(radioBaru)) {
    try {
      radioBaru.click();
    } catch (e) {
      console.warn("[PCare AutoFiller] Gagal klik radio baru:", e.message);
    }
  }

  const btnBaru = document.querySelector('#btnBaru, #btnReset, button[id*="baru"]') ||
    document.querySelector('#btnBatal, #btn_batal');
  if (btnBaru && isElementVisible(btnBaru)) {
    try {
      btnBaru.click();
    } catch (e) {
      console.warn("[PCare AutoFiller] Gagal klik tombol baru/reset:", e.message);
    }
  }

  // C. Kosongkan manual input pencarian peserta:
  const elSearch = (SELECTORS_PENDAFTARAN.txtPeserta && document.querySelector(SELECTORS_PENDAFTARAN.txtPeserta)) ||
    document.querySelector('#txtpeserta, #noKartu') ||
    (SELECTORS_PENDAFTARAN.noKartu && document.querySelector(SELECTORS_PENDAFTARAN.noKartu));

  if (elSearch) {
    elSearch.value = '';
    elSearch.dispatchEvent(new Event('input', { bubbles: true }));
    elSearch.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const elKartu = document.querySelector(SELECTORS_PENDAFTARAN.noKartu);
  if (elKartu && elKartu !== elSearch) {
    elKartu.value = '';
    elKartu.dispatchEvent(new Event('input', { bubbles: true }));
    elKartu.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // D. Berikan jeda sleep(1500) agar seluruh elemen form PCare kembali ke kondisi siap input
  await sleep(1500);
}

/**
 * Alur Logika Injeksi Data ke Form Pendaftaran PCare BPJS (Modul 1)
 */
async function injectPatientData(data, customDate = "", sheetTarget = "PROLANIS") {
  // 1. Tentukan tanggal pendaftaran dinamis dalam format DD-MM-YYYY:
  // Evaluasi effectiveDate / tglOffset (H+1) / tglPly dari spreadsheet
  let targetDate = "";
  if (data.effectiveDate && String(data.effectiveDate).trim() !== "") {
    targetDate = convertToDDMMYYYY(data.effectiveDate);
  } else if (data.tglOffset && String(data.tglOffset).trim() !== "") {
    targetDate = convertToDDMMYYYY(data.tglOffset);
  } else if (data.isDuplicateSameDay && data.tglPly) {
    targetDate = addDaysToDateString(data.tglPly, 1);
    data.tglOffset = targetDate;
    data.effectiveDate = targetDate;
  } else if (data.tglPly && String(data.tglPly).trim() !== "") {
    targetDate = convertToDDMMYYYY(data.tglPly);
  } else if (data.tglHasil && String(data.tglHasil).trim() !== "") {
    targetDate = convertToDDMMYYYY(data.tglHasil);
  } else if (data.tglEntri && String(data.tglEntri).trim() !== "") {
    targetDate = convertToDDMMYYYY(data.tglEntri);
  } else if (customDate && String(customDate).trim() !== "") {
    targetDate = convertToDDMMYYYY(customDate);
  } else {
    targetDate = getTodayDDMMYYYY();
  }

  // Jika pasien adalah duplikat H+1, catat log:
  if (data.isDuplicateSameDay) {
    console.log(`[PCare AutoFiller] Pasien ganda terdeteksi (${data.nama || data.noBpjs || '-'}) -> Tanggal disesuaikan H+1: ${targetDate}`);
    showNotification(`Pasien ganda terdeteksi (${data.nama || data.noBpjs || '-'}) -> Tanggal disesuaikan H+1: ${targetDate}`, "info");
  }

  // Simpan tanggal yang dipakai agar sinkron dengan Google Sheets
  data.actualRegisteredDate = targetDate;
  console.log(`[PCare AutoFiller] [Modul 1] Target tanggal pendaftaran yang akan diinput: "${targetDate}" (tglPly: "${data.tglPly || '-'}")`);

  // Set tanggal pendaftaran di form PCare di awal
  await setTanggalPendaftaran(targetDate);
  await enforceTanggalPendaftaran(targetDate);

  const rawNoBpjs = String(data.noBpjs || "").trim();
  const noBpjs = rawNoBpjs.padStart(13, "0");

  console.log(`[PCare AutoFiller] 1. Mengisi No. Pencarian / Kartu BPJS (13 Digit): "${noBpjs}" (Asal: "${rawNoBpjs}")...`);
  const elSearchInput = document.querySelector('#txtpeserta, #nomor, #txtnokartu, #txtPencarian, input[name="txtpeserta"], input[name="nomor"], input[placeholder*="Nomor" i]');
  if (!elSearchInput) {
    throw new Error("Elemen input pencarian peserta (#txtpeserta / #nomor) tidak ditemukan di PCare.");
  }

  elSearchInput.removeAttribute("maxlength");
  elSearchInput.removeAttribute("readonly");
  elSearchInput.focus();
  elSearchInput.value = noBpjs;
  elSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
  elSearchInput.dispatchEvent(new Event('change', { bubbles: true }));
  elSearchInput.dispatchEvent(new Event('blur', { bubbles: true }));

  if (typeof window !== "undefined" && window.jQuery) {
    try {
      window.jQuery(elSearchInput).val(noBpjs).trigger('change');
    } catch (e) { }
  }
  await sleep(300);

  console.log("[PCare AutoFiller] 2. Mengklik tombol Cari Peserta...");
  const btnCari = document.querySelector('#btnCariPeserta, #btnCari, button[onclick*="Cari" i], button i.fa-search, .btn-search, #nomor ~ button, #txtpeserta ~ button') ||
    Array.from(document.querySelectorAll('button, a.btn')).find(b => {
      const bTxt = (b.textContent || '').toLowerCase();
      return bTxt.includes('cari') || b.querySelector('i.fa-search');
    });

  if (btnCari) {
    const targetBtn = btnCari.tagName === 'I' ? btnCari.closest('button') || btnCari : btnCari;
    targetBtn.click();
    targetBtn.dispatchEvent(new Event('click', { bubbles: true }));
  } else {
    elSearchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }
  // Jeda tunggu awal setelah klik cari sebelum mulai memeriksa data profil peserta
  await delay(1200);

  console.log(`[PCare AutoFiller] 3. Menunggu data peserta "${noBpjs}" muncul di layar (maksimal 10 detik)...`);
  showNotification(`Mencari data BPJS ${noBpjs}... Menunggu verifikasi...`, "info");

  let isLoaded = false;
  try {
    isLoaded = await waitForPatientData(10000);
  } catch (errWait) {
    isLoaded = false;
  }

  // 4C. Deteksi Pendaftaran Gagal / Ditolak PCare (Klaim Mundur):
  const rejAfterSearch = await checkPendaftaranDialogRejection();
  if (rejAfterSearch) {
    const reason = rejAfterSearch.reason;
    console.log(`[PCare AutoFiller] Pendaftaran Gagal (${reason}) -> Dipindahkan ke Sheet KLAIM MUNDUR`);
    showNotification(`[PCare AutoFiller] Pendaftaran Gagal (${reason}) -> Dipindahkan ke Sheet KLAIM MUNDUR`, "warning");
    await movePatientRowInSheets(data.rowNumber, data.sheetName || 'PROLANIS OKTOBER 2026', 'KLAIM MUNDUR', reason, noBpjs);
    closePendaftaranDialogRejection();
    await resetFormPendaftaran();
    return { success: false, moved: true, target: "KLAIM MUNDUR", reason: reason };
  }

  if (!isLoaded) {
    const rejAfterTimeout = await checkPendaftaranDialogRejection();
    if (rejAfterTimeout) {
      const reason = rejAfterTimeout.reason;
      console.log(`[PCare AutoFiller] Pendaftaran Gagal (${reason}) -> Dipindahkan ke Sheet KLAIM MUNDUR`);
      showNotification(`[PCare AutoFiller] Pendaftaran Gagal (${reason}) -> Dipindahkan ke Sheet KLAIM MUNDUR`, "warning");
      await movePatientRowInSheets(data.rowNumber, data.sheetName || 'PROLANIS OKTOBER 2026', 'KLAIM MUNDUR', reason, noBpjs);
      closePendaftaranDialogRejection();
      await resetFormPendaftaran();
      return { success: false, moved: true, target: "KLAIM MUNDUR", reason: reason };
    }
    // Jika data tidak muncul tapi bukan penolakan fatal: lempar error agar tidak dipindahkan ke Klaim Mundur dan TGL ENTRI tetap kosong
    throw new Error("Data profil peserta tidak termuat dari BPJS.");
  }

  console.log(`[PCare AutoFiller] [SUKSES] Data pasien ${noBpjs} berhasil dimuat! Melanjutkan pengisian form...`);
  showNotification(`Data pasien ${noBpjs} siap. Mengisi form...`, "info");
  await sleep(500);

  // Titik 1: Kunci tanggal pendaftaran setelah profil pasien dimuat (cegah form ter-reset oleh respon AJAX PCare)
  await enforceTanggalPendaftaran(targetDate);
  await sleep(300);

  // DETEKSI JENIS KEPESERTAAN: Papsmear, Skrining DM, atau Prolanis
  const detectedJenis = detectJenisKepesertaan();
  data.detectedJenis = detectedJenis;
  if (detectedJenis) {
    console.log(`[PCare AutoFiller] [Modul 1] Jenis kepesertaan terdeteksi: "${detectedJenis}"`);
    showNotification(`Terdeteksi: ${detectedJenis}`, "info");
  }

  // 4B. Deteksi Pasien Pap Smear & Skrining DM di Sheet Prolanis:
  const rawDiag = String(data.diagnosa || data.rawCols?.AI || data.rawCols?.Z || data.rawCols?.Y || "").toLowerCase().replace(/\s+/g, "");
  const rawKeluhan = String(data.keluhan || data.rawCols?.AD || data.rawCols?.T || data.rawCols?.U || "").toLowerCase();
  const rawPelayanan = String(data.pelayananNonKapitasi || data.rawCols?.AO || data.rawCols?.AP || "").toLowerCase();

  const isPapSmear = (
    rawDiag === "z12.4" || rawDiag === "z124" ||
    rawKeluhan.includes("papsmear") || rawKeluhan.includes("pap smear") || rawKeluhan.includes("serviks") ||
    rawPelayanan.includes("papsmear") || rawPelayanan.includes("serviks") ||
    detectedJenis === "PAPSMEAR"
  );

  const isSkriningDm = (
    rawDiag === "z13.1" || rawDiag === "z131" ||
    rawKeluhan.includes("skrining dm") || rawKeluhan.includes("skrining diabetes") ||
    rawPelayanan.includes("skrining") || rawPelayanan.includes("penapisan") ||
    detectedJenis === "SKRINING DM"
  );

  const currentSheetUpper = String(data.sheetName || sheetTarget || "").toUpperCase();
  const isFromProlanis = currentSheetUpper.includes("PROLANIS") || (!currentSheetUpper.includes("PAP") && !currentSheetUpper.includes("SKRINING"));

  // 1. PAP SMEAR: JANGAN didaftarkan ke PCare (skip submit), langsung panggil movePatientRow ke sheet PAPSMEAR OKTOBER 2026
  if (isFromProlanis && isPapSmear) {
    console.log("[PCare AutoFiller] Terdeteksi Pap Smear -> Dipindahkan ke Sheet PAPSMEAR");
    showNotification("[PCare AutoFiller] Terdeteksi Pap Smear -> Dipindahkan ke Sheet PAPSMEAR", "info");
    await movePatientRowInSheets(data.rowNumber, data.sheetName || 'PROLANIS OKTOBER 2026', 'PAPSMEAR OKTOBER 2026', '', noBpjs);
    await resetFormPendaftaran();
    return { moved: true, target: "PAPSMEAR OKTOBER 2026" };
  }

  // CATATAN: Untuk Pasien Skrining DM (diagnosa z13.1, keluhan skrining dm, atau tindakan gula darah penapisan):
  // Pasien Skrining DM WAJIB TETAP DIDAFTARKAN ke PCare sampai proses submit pendaftaran berhasil!

  // Radio Promotif Preventif
  safeCheckRadio(SELECTORS_PENDAFTARAN.tkpPromotif);
  await sleep(300);

  // Dropdown Poli Tujuan "004" (Laboratorium)
  safeSelect(SELECTORS_PENDAFTARAN.poli, "004");
  await delay(600);

  // Keluhan (Prioritas data.keluhan dari spreadsheet -> fallback cerdas diagnosa)
  let regFallbackKeluhan = "Pemeriksaan Prolanis";
  if (rawDiag === "z13.1" || rawDiag === "z131" || isSkriningDm) regFallbackKeluhan = "SKRINING KESEHATAN";
  else if (rawDiag === "z12.4" || rawDiag === "z124") regFallbackKeluhan = "SKRINING KANKER SERVIKS";
  else if (rawDiag === "i10") regFallbackKeluhan = "HIPERTENSI";
  else if (rawDiag === "e11.9" || rawDiag === "e119") regFallbackKeluhan = "DIABETES MELITUS";
  const keluhanText = (data.keluhan && String(data.keluhan).trim()) || regFallbackKeluhan;
  safeInject(SELECTORS_PENDAFTARAN.keluhan, keluhanText);
  await sleep(300);

  // Fisik
  safeInject(SELECTORS_PENDAFTARAN.tb, (data.tb && String(data.tb).trim()) || "160");
  safeInject(SELECTORS_PENDAFTARAN.bb, (data.bb && String(data.bb).trim()) || "60");
  safeInject(SELECTORS_PENDAFTARAN.lp, (data.lp && String(data.lp).trim()) || "80");
  safeInject(SELECTORS_PENDAFTARAN.respRate, (data.rr && String(data.rr).trim()) || "20");
  safeInject(SELECTORS_PENDAFTARAN.heartRate, (data.hr && String(data.hr).trim()) || "80");

  // Tensi
  const tensiRaw = (data.tensi && String(data.tensi).trim()) || "120/80";
  let sistole = (data.sistole && String(data.sistole).trim()) || "120";
  let diastole = (data.diastole && String(data.diastole).trim()) || "80";

  if (tensiRaw.includes("/")) {
    const parts = tensiRaw.split("/");
    sistole = (parts[0] && parts[0].trim()) || sistole;
    diastole = (parts[1] && parts[1].trim()) || diastole;
  } else if (tensiRaw && tensiRaw !== "120/80") {
    sistole = tensiRaw;
  }

  safeInject(SELECTORS_PENDAFTARAN.sistole, sistole);
  safeInject(SELECTORS_PENDAFTARAN.diastole, diastole);

  // Titik 2: Penguncian tanggal tepat 300ms SEBELUM tombol simpan pendaftaran diklik
  await enforceTanggalPendaftaran(targetDate);
  await sleep(300);

  // Verifikasi: jika el.value !== targetDate, paksa timpa lagi nilainya ke targetDate
  const elDateVerify = document.querySelector(SELECTORS_PENDAFTARAN.txtTanggal) || document.querySelector('#txttanggal, input[name="txttanggal"]');
  if (elDateVerify && elDateVerify.value !== targetDate) {
    console.warn(`[PCare AutoFiller] Tanggal terdeteksi melenceng ("${elDateVerify.value}"), memaksa penguncian ke "${targetDate}"...`);
    elDateVerify.value = targetDate;
    await enforceTanggalPendaftaran(targetDate);
  }

  console.log(`[PCare AutoFiller] Tanggal pendaftaran terverifikasi: "${elDateVerify ? elDateVerify.value : targetDate}" (Target: "${targetDate}").`);
  // Jeda napas setelah semua field terisi dan tanggal terkunci
  await delay(1000);

  console.log("[PCare AutoFiller] Mengklik tombol Simpan Pendaftaran...");
  const btnSimpan = document.querySelector('#btnSimpanPendaftaran, #btnSimpan, #btn_simpan, button[id*="Simpan" i], button[onclick*="simpan" i], button.btn-success');
  if (btnSimpan) {
    btnSimpan.click();
    btnSimpan.dispatchEvent(new Event("click", { bubbles: true }));
  } else {
    const clickSimpan = safeClick(SELECTORS_PENDAFTARAN.btnSimpan);
    if (!clickSimpan) {
      throw new Error("Gagal mengeklik tombol Simpan Pendaftaran (#btnSimpanPendaftaran).");
    }
  }

  // Jeda awal 500ms
  await sleep(500);

  // Polling verifikasi simpan ketat (Strict Success Verification) selama maksimal 10 detik
  let isSavedSuccess = false;
  let noAntrean = "";
  const pollStart = Date.now();

  while (Date.now() - pollStart < 10000) {
    // 1. Cek apakah setelah submit muncul dialog penolakan fatal PCare (Klaim Mundur)
    const fatalRej = await checkPendaftaranDialogRejection();
    if (fatalRej) {
      const reason = fatalRej.reason;
      console.log(`[PCare AutoFiller] Pendaftaran Gagal (${reason}) -> Dipindahkan ke Sheet KLAIM MUNDUR`);
      showNotification(`[PCare AutoFiller] Pendaftaran Gagal (${reason}) -> Dipindahkan ke Sheet KLAIM MUNDUR`, "warning");
      await movePatientRowInSheets(data.rowNumber, data.sheetName || 'PROLANIS OKTOBER 2026', 'KLAIM MUNDUR', reason, noBpjs);
      closePendaftaranDialogRejection();
      await resetFormPendaftaran();
      return { success: false, moved: true, target: "KLAIM MUNDUR", reason: reason };
    }

    // 2. Cek apakah modal konfirmasi SweetAlert sukses muncul
    const successModal = document.querySelector(".swal2-success, .sa-success, .sweet-alert, .swal2-container, .bootbox.modal, .modal.in, .modal.show");
    let hasSuccessSignal = false;
    if (successModal && isElementVisible(successModal)) {
      const modalTxt = (successModal.textContent || "").toLowerCase();
      if (
        modalTxt.includes("berhasil") ||
        modalTxt.includes("sukses") ||
        modalTxt.includes("tersimpan") ||
        modalTxt.includes("pendaftaran berhasil")
      ) {
        hasSuccessSignal = true;
      }
    }

    // 3. Ekstrak nomor antrean
    noAntrean = extractPendaftaranQueueNumber();

    if (hasSuccessSignal || noAntrean) {
      isSavedSuccess = true;
      break;
    }

    await sleep(400);
  }

  // JIKA dalam 10 detik tidak ada respon sukses / form tertahan error:
  if (!isSavedSuccess) {
    console.error(`[PCare AutoFiller] Pendaftaran ${data.nama || noBpjs} gagal/timeout di PCare. TGL ENTRI dibiarkan kosong.`);
    showNotification(`Pendaftaran ${data.nama || noBpjs} gagal tersimpan di PCare. TGL ENTRI tidak diisi.`, "warning");
    await resetFormPendaftaran();
    return { success: false, moved: false, reason: "Gagal / timeout konfirmasi simpan PCare" };
  }

  // Tutup Modal / Alert Sukses PCare dan Reset Form
  await closePendaftaranSuccessDialog();
  await resetFormPendaftaran();

  // Evaluasi Target Skrining DM (Kasus Warsiti, Tri Heni, Sum Siswaningrum, dll)
  const lrData = data.labResults || extractLabResults(data);
  const hasGulaOnlyWithoutProlanis = Boolean(
    (lrData.gdp || lrData.gdpp || lrData.gds || data.rawCols?.V || data.rawCols?.W || data.rawCols?.X || data.rawCols?.GDP || data.rawCols?.GDPP || data.rawCols?.GDS) &&
    !lrData.hba1c && !data.rawCols?.U && !data.rawCols?.HBA1C &&
    !lrData.cho && !data.rawCols?.N && !data.rawCols?.CHO &&
    detectedJenis !== "PROLANIS"
  );

  const isSkriningTarget = Boolean(
    data.isDuplicateSameDay ||
    data.isSkrining ||
    String(data.diagnosa || data.rawCols?.AI || data.rawCols?.Y || "").toLowerCase().replace(/\s+/g, "").includes("z13.1") ||
    String(data.diagnosa || "").toLowerCase().replace(/\s+/g, "").includes("z131") ||
    String(data.keluhan || data.rawCols?.AD || data.rawCols?.T || "").toLowerCase().includes("skrining") ||
    String(data.pelayananNonKapitasi || "").toLowerCase().includes("skrining") ||
    String(data.pelayananNonKapitasi || "").toLowerCase().includes("penapisan") ||
    detectedJenis === "SKRINING DM" ||
    hasGulaOnlyWithoutProlanis
  );

  // Khusus Pasien Skrining DM: Pindahkan ke Sheet 'SKRINING DM OKTOBER 2026'
  if (isFromProlanis && isSkriningTarget) {
    await movePatientRowInSheets(
      data.rowNumber,
      data.sheetName || 'PROLANIS OKTOBER 2026',
      'SKRINING DM OKTOBER 2026',
      '',
      noBpjs,
      noAntrean,
      targetDate
    );
    console.log(`[PCare AutoFiller] Pasien Skrining DM (${data.nama || noBpjs}) sukses daftar -> Dipotong ke Sheet SKRINING DM OKTOBER 2026`);
    showNotification(`Pasien Skrining DM (${data.nama || noBpjs}) sukses daftar -> Dipotong ke Sheet SKRINING DM OKTOBER 2026`, "success");
    return { success: true, moved: true, target: "SKRINING DM OKTOBER 2026", noAntrean: noAntrean };
  }

  // Pasien Prolanis Reguler Sukses
  return { success: true, moved: false, noAntrean: noAntrean };
}


/**
 * =========================================================================================
 * DOM & UI HELPER FUNCTIONS
 * =========================================================================================
 */

/**
 * Helper: Menunggu data profil pasien pendaftaran muncul di DOM (Modul 1)
 */
function waitForPatientData(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const checkLoaded = () => {
      // a. #namaPeserta, #lblNamaPeserta, #nama, atau .nama-peserta memiliki teks lebih dari 2 karakter
      const namaEl = document.querySelector(SELECTORS_PENDAFTARAN.namaPeserta);
      if (namaEl) {
        const textVal = (namaEl.textContent || namaEl.value || namaEl.innerText || "").trim();
        if (textVal.length > 2 && !textVal.toLowerCase().includes("cari")) {
          return true;
        }
      }

      // b. #noKartu_lbl, #lblNoKartu, atau teks kartu peserta di profil kiri terisi angka kartu (panjang >= 10 digit)
      const kartuEl = document.querySelector('#noKartu_lbl, #lblNoKartu, #lblNoPeserta, #txtnokartu_lbl, .profile-user-info');
      if (kartuEl) {
        const digits = (kartuEl.textContent || kartuEl.innerText || "").replace(/\D/g, "");
        if (digits.length >= 10) {
          return true;
        }
      }

      return false;
    };

    if (checkLoaded()) return resolve(true);

    let timer = null;
    let pollInterval = null;
    let observer = null;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
    };

    timer = setTimeout(() => {
      cleanup();
      // Jika dalam timeoutMs profil peserta tidak memiliki teks nama/nomor kartu valid, lempar Error
      reject(new Error("Data profil peserta tidak termuat dari BPJS."));
    }, timeoutMs);

    observer = new MutationObserver(() => {
      if (checkLoaded()) {
        cleanup();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    pollInterval = setInterval(() => {
      // Cek dan tutup otomatis modal skrining riwayat kesehatan jika muncul saat pencarian
      const swalContainer = document.querySelector(".sweet-alert, .swal2-container, .swal-modal");
      if (swalContainer && isElementVisible(swalContainer)) {
        const swalText = (swalContainer.textContent || "").toLowerCase();
        if (swalText.includes("skrining riwayat kesehatan") || swalText.includes("riwayat kesehatan")) {
          const btnConfirm = swalContainer.querySelector(".swal2-confirm, .sweet-alert button.confirm, button.swal2-confirm, .btn-confirm, button.confirm, button");
          if (btnConfirm) {
            try { btnConfirm.click(); } catch (e) { }
          }
        }
      }

      if (checkLoaded()) {
        cleanup();
        resolve(true);
      }
    }, 250);
  });
}

/**
 * Helper: Mendeteksi apakah muncul pesan error / modal "Data tidak ditemukan" di PCare
 */
function checkKunjunganDataNotFound() {
  // 1. Cek SweetAlert (baik v1 maupun v2) atau dialog modal konfirmasi
  const swalModals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show");
  for (const m of swalModals) {
    if (isElementVisible(m)) {
      const txt = (m.textContent || "").toLowerCase();
      if (txt.includes("tidak ditemukan") || txt.includes("belum terdaftar") || txt.includes("tidak ada data") || txt.includes("gagal memuat")) {
        // Klik tombol OK/Confirm/Tutup pada dialog agar tidak menghalangi pencarian pasien selanjutnya
        const closeBtn = m.querySelector("button.confirm, .swal2-confirm, .btn-primary, button.close, button");
        if (closeBtn) closeBtn.click();
        return true;
      }
    }
  }

  // 2. Cek Toastr notification atau Bootstrap alert message
  const alertEls = document.querySelectorAll(".toast-message, #toast-container, .alert-danger, .alert-warning");
  for (const a of alertEls) {
    if (isElementVisible(a)) {
      const txt = (a.textContent || "").toLowerCase();
      if (txt.includes("tidak ditemukan") || txt.includes("belum terdaftar") || txt.includes("tidak ada data")) {
        return true;
      }
    }
  }

  // 3. Cek span/div info error di dekat form pencarian
  const searchContainer = document.querySelector("#nomor")?.closest(".form-group, .row, .panel-body, form");
  if (searchContainer) {
    const errorEls = searchContainer.querySelectorAll(".text-danger, .help-block, .error");
    for (const err of errorEls) {
      if (isElementVisible(err)) {
        const txt = (err.textContent || "").toLowerCase();
        if (txt.includes("tidak ditemukan") || txt.includes("belum terdaftar")) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Helper: Mendeteksi apakah form kunjungan memicu error validasi / alert penolakan setelah tombol simpan ditekan
 * Mendeteksi pesan seperti 'This field is required', 'Suhu tidak sesuai', SweetAlert error, Toastr error, dsb.
 */
function checkFormKunjunganSaveError() {
  // Pengecekan Sukses Simpan Kunjungan: jika notifikasi sukses muncul DAN tidak ada modal/toastr error, return null
  const isSuccessSaved = document.body.innerText.includes('Data kunjungan berhasil disimpan') ||
    document.body.innerText.includes('kunjungan berhasil disimpan');
  const hasAlertDanger = Boolean(document.querySelector('.toast-error, .alert-danger, .field-validation-error'));
  if (isSuccessSaved && !hasAlertDanger) {
    return null;
  }

  // 1. Cek SweetAlert (baik v1 maupun v2) atau dialog modal konfirmasi error
  const modals = document.querySelectorAll(".sweet-alert, .swal2-container, .swal-modal, .bootbox.modal, .modal.in, .modal.show");
  for (const m of modals) {
    if (isElementVisible(m)) {
      const text = (m.textContent || "").trim();
      const textLower = text.toLowerCase();

      // Abaikan jika dialog menyatakan sukses/berhasil/tersimpan atau sudah dilayani / sudah pernah dientri / kunjungan sudah ada
      if (textLower.includes("berhasil") || textLower.includes("sukses") || textLower.includes("tersimpan") ||
        textLower.includes("sudah dilayani") || textLower.includes("sudah pernah dientri") || textLower.includes("kunjungan sudah ada")) {
        continue;
      }

      // Deteksi indikasi dialog error atau validasi penolakan nyata
      const hasErrorIndicator = m.querySelector(".sa-error, .swal2-error, .alert-danger, .modal-header.bg-danger");
      const hasErrorWords = textLower.includes("error") ||
        textLower.includes("gagal") ||
        textLower.includes("tidak sesuai") ||
        textLower.includes("required") ||
        textLower.includes("wajib diisi") ||
        textLower.includes("harus diisi") ||
        textLower.includes("tidak boleh kosong");

      if (hasErrorIndicator || hasErrorWords) {
        // Coba tutup dialog jika ada tombol close/ok agar tidak memblokir antarmuka
        const btnClose = m.querySelector("button.confirm, .swal2-confirm, button.close, .btn-primary, button");
        if (btnClose) btnClose.click();
        return text || "Penolakan dialog PCare muncul saat simpan";
      }
    }
  }

  // 2. Cek Toastr notification error atau Bootstrap alert-danger (HANYA error penolakan, bukan warning kuning lama)
  const alertEls = document.querySelectorAll(".toast-error, .alert-danger");
  for (const a of alertEls) {
    if (isElementVisible(a)) {
      const txt = (a.textContent || "").trim();
      if (txt.length > 0 && !txt.includes("Data kunjungan berhasil disimpan")) return txt;
    }
  }

  // 3. Cek span/div help-block / text-danger / field-validation-error (misal: 'This field is required' atau 'Suhu tidak sesuai')
  const fieldErrors = document.querySelectorAll(".help-block, .field-validation-error, .text-danger, label.error, span.error");
  for (const err of fieldErrors) {
    if (isElementVisible(err)) {
      const txt = (err.textContent || "").trim();
      const txtLower = txt.toLowerCase();
      if (
        txtLower.includes("required") ||
        txtLower.includes("wajib") ||
        txtLower.includes("tidak sesuai") ||
        txtLower.includes("tidak boleh kosong") ||
        txtLower.includes("harus diisi") ||
        txtLower.includes("invalid") ||
        txtLower.includes("salah")
      ) {
        return txt;
      }
    }
  }

  // 4. Cek spesifik pesan penolakan pada input suhu (#suhu_txt)
  const suhuInput = document.querySelector(SELECTORS_KUNJUNGAN.suhu);
  if (suhuInput) {
    const parentContainer = suhuInput.closest(".form-group, td, tr, div");
    if (parentContainer) {
      const errEl = parentContainer.querySelector(".help-block, .text-danger, .error");
      if (errEl && isElementVisible(errEl) && errEl.textContent.trim().length > 0) {
        return "Suhu tidak sesuai: " + errEl.textContent.trim();
      }
    }
  }

  return null;
}

/**
 * Helper: Memilih Tenaga Medis (Dokter) pada dropdown / Select2 PCare
 * Mengutamakan nama dokter dari data sheet pasien jika ada, atau memilih opsi valid pertama yang tersedia
 */
async function setTenagaMedisKunjungan(patient) {
  const namaMedis = (patient.rawCols?.AK || patient.tenagaMedis || '').toUpperCase();
  let valMedis = '647743'; // Default Dede Kurniasih
  if (namaMedis.includes('MINTO')) valMedis = '26767';
  else if (namaMedis.includes('AWIT')) valMedis = '647724';
  else if (namaMedis.includes('RETNO')) valMedis = '647736';
  else if (namaMedis.includes('AMINATUL')) valMedis = '714838';

  const $jq = window.jQuery || (typeof $ !== 'undefined' ? $ : null);
  if ($jq && $jq('#tenagamedis').data('select2')) {
    $jq('#tenagamedis').val(valMedis).trigger('change');
  } else {
    const el = document.querySelector('#tenagamedis') || document.querySelector('select[name="tenagamedis"]') || document.querySelector(SELECTORS_KUNJUNGAN.dokter);
    if (el) {
      el.value = valMedis;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  return true;
}

/**
 * Helper: Memilih opsi Pelayanan Non Kapitasi sesuai hasil lab pasien
 * (misal 'Pelayanan Kimia Darah' atau 'Pelayanan Gula Darah')
 */
async function setPelayananNonKapitasiKunjungan(lab, patient = {}) {
  const paketStr = String(patient.pelayananNonKapitasi || patient.rawCols?.AO || patient.rawCols?.AP || '');
  const lr = patient.labResults || lab || {};
  const targetValues = [];

  if (paketStr.includes('Gula') || (lr.gdp || lr.gdpp || lr.gds)) {
    targetValues.push('10');
  }
  if (paketStr.includes('HbA1c') || lr.hba1c) {
    targetValues.push('11');
  }
  if (paketStr.includes('Kimia') || (lr.cho || lr.tg || lr.hdl)) {
    targetValues.push('12');
  }
  const paketLower = paketStr.toLowerCase();
  if (paketLower.includes('serviks') || paketLower.includes('papsmear')) {
    targetValues.push('25');
  }
  if (paketLower.includes('skrining dm')) {
    targetValues.push('26');
  }

  // Manipulasi DOM standar tanpa inline script (CSP Manifest V3 compliant)
  const selectEl = document.querySelector('#listNonKapitasi_slc') || document.querySelector('select[name="listNonKapitasi_slc"]');
  if (selectEl) {
    Array.from(selectEl.options).forEach(opt => {
      opt.selected = targetValues.includes(opt.value);
    });
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const $jqPCare = window.jQuery || (typeof $ !== 'undefined' ? $ : null);
  if ($jqPCare && $jqPCare('#listNonKapitasi_slc').length) {
    try {
      $jqPCare('#listNonKapitasi_slc').val(targetValues).trigger('change');
    } catch (e) { }
  }

  return true;
}

/**
 * Helper: Menunggu data profil pasien entri kunjungan muncul di DOM (Modul 2)
 * Segera mengembalikan { status: 'not_found' } jika muncul notifikasi 'Data tidak ditemukan' tanpa menunggu timeout 15 detik!
 */
function waitForKunjunganPatientLoaded(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const checkState = () => {
      // 1. Cek apakah muncul notifikasi 'Data tidak ditemukan'
      if (checkKunjunganDataNotFound()) {
        return { status: "not_found" };
      }

      // 2. Cek apakah profil kunjungan / form (#keluhan, anamnesa, nama pasien, atau nomor kartu) sudah berhasil dimuat
      const keluhanEl = document.querySelector(SELECTORS_KUNJUNGAN.keluhan);
      const anamnesaEl = document.querySelector(SELECTORS_KUNJUNGAN.anamnesa);
      const tbEl = document.querySelector(SELECTORS_KUNJUNGAN.tb);
      const namaEl = document.querySelector("#namaPeserta, #nama, .nama-peserta, #lblNamaPeserta, #lblNama");
      const kartuEl = document.querySelector("#noKartu_lbl, #lblNoKartu, #noKartu, #noPeserta, #lblNoPeserta");

      const hasKartu = kartuEl && isElementVisible(kartuEl) && (kartuEl.textContent || kartuEl.value || "").replace(/\D/g, "").length >= 10;
      const hasNama = namaEl && isElementVisible(namaEl) && (namaEl.textContent || namaEl.value || "").trim().length > 2;
      const hasFormOpen = (keluhanEl && !keluhanEl.disabled && isElementVisible(keluhanEl)) ||
        (anamnesaEl && !anamnesaEl.disabled && isElementVisible(anamnesaEl)) ||
        (tbEl && !tbEl.disabled && isElementVisible(tbEl));

      if (hasKartu || hasFormOpen || hasNama) {
        return { status: "loaded" };
      }

      return null;
    };

    const initial = checkState();
    if (initial) return resolve(initial);

    let timer = null;
    let pollInterval = null;
    let observer = null;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      if (pollInterval) clearInterval(pollInterval);
    };

    timer = setTimeout(() => {
      cleanup();
      console.warn(`[PCare AutoFiller] [TIMEOUT] Batas waktu ${timeoutMs / 1000}s habis menunggu data profil kunjungan.`);
      resolve({ status: "timeout" });
    }, timeoutMs);

    observer = new MutationObserver(() => {
      const state = checkState();
      if (state) {
        cleanup();
        resolve(state);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    pollInterval = setInterval(() => {
      const state = checkState();
      if (state) {
        cleanup();
        resolve(state);
      }
    }, 200);
  });
}


/**
 * Mencari tombol search di sebelah input nomor kartu (#nomor)
 */
function findSearchButtonKunjungan() {
  const nomorEl = document.querySelector(SELECTORS_KUNJUNGAN.nomor);
  if (nomorEl) {
    const parent = nomorEl.closest(".input-group") || nomorEl.parentElement;
    if (parent) {
      const btn = parent.querySelector("button, a.btn, .input-group-btn button, .input-group-addon");
      if (btn) return btn;
    }
    const siblingBtn = nomorEl.nextElementSibling;
    if (siblingBtn && (siblingBtn.tagName === "BUTTON" || siblingBtn.tagName === "A")) {
      return siblingBtn;
    }
  }

  // Cari tombol yang memiliki icon search
  const iconBtn = document.querySelector("button:has(i.fa-search), button:has(i.glyphicon-search), a:has(i.fa-search)");
  if (iconBtn) return iconBtn;

  // Cek selector umum lainnya
  return document.querySelector("#btnCariPeserta, #btnCari, #btnCariKunjungan, .btn-search");
}

/**
 * Helper: Berpindah antar tab (Bootstrap tabs) berdasarkan selector atau teks label
 */
async function switchTab(...identifiers) {
  for (const iden of identifiers) {
    if (!iden) continue;

    // 1. Coba sebagai CSS selector langsung
    try {
      if (iden.startsWith("#") || iden.startsWith(".")) {
        const link = document.querySelector(`a[href="${iden}"]`) ||
          document.querySelector(`a[data-target="${iden}"]`) ||
          document.querySelector(iden);
        if (link) {
          link.click();
          link.dispatchEvent(new Event("click", { bubbles: true }));
          await sleep(400);
          return true;
        }
      }
    } catch (e) { }

    // 2. Coba mencari elemen <a> dalam nav-tabs dengan teks yang cocok
    const tabLinks = Array.from(document.querySelectorAll("ul.nav-tabs a, .nav a, a[data-toggle='tab'], a[role='tab']"));
    const match = tabLinks.find(a => (a.textContent || "").toLowerCase().includes(iden.toLowerCase()));
    if (match) {
      match.click();
      match.dispatchEvent(new Event("click", { bubbles: true }));
      await sleep(400);
      return true;
    }
  }

  console.warn(`[PCare AutoFiller] Tab '${identifiers.join(", ")}' tidak ditemukan.`);
  return false;
}

/**
 * Mencari tombol "Tambah Data" di dalam kontainer tab yang aktif
 */
function findTambahButtonInTab(tabTextHint) {
  const specific = document.querySelector(`button[id*="tambah"], a[id*="tambah"], .btn-tambah`);

  const activePanes = document.querySelectorAll(".tab-pane.active, .tab-pane.in, div[id*='tabDet']");
  for (const pane of activePanes) {
    const buttons = Array.from(pane.querySelectorAll("button, a.btn"));
    const found = buttons.find(b => {
      const t = (b.textContent || "").toLowerCase();
      return t.includes("tambah") || t.includes("baru");
    });
    if (found) return found;
  }

  const allButtons = Array.from(document.querySelectorAll("button, a.btn"));
  return allButtons.find(b => {
    const t = (b.textContent || "").toLowerCase();
    return t.includes("tambah data") || (tabTextHint && t.includes(tabTextHint.toLowerCase()));
  }) || specific;
}

/**
 * Memilih opsi dropdown di dalam modal aktif atau kontainer tab
 */
function safeSelectModalOrTab(selectorList, targetValueOrText) {
  if (typeof selectorList === "string") selectorList = [selectorList];

  for (const sel of selectorList) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el)) {
      return safeSelect(sel, targetValueOrText);
    }
  }

  const openModal = document.querySelector(".modal.in, .modal.show, .modal[style*='display: block']");
  if (openModal) {
    const selectEl = openModal.querySelector("select");
    if (selectEl) {
      return selectOptionByTextOrValue(selectEl, targetValueOrText);
    }
  }

  return safeSelect(selectorList[0], targetValueOrText);
}

/**
 * Injeksi nilai input di dalam modal aktif atau tab
 */
function safeInjectModalOrTab(selectorList, value) {
  if (typeof selectorList === "string") selectorList = [selectorList];

  for (const sel of selectorList) {
    const el = document.querySelector(sel);
    if (el && isElementVisible(el)) {
      return safeInject(sel, value);
    }
  }

  const openModal = document.querySelector(".modal.in, .modal.show, .modal[style*='display: block']");
  if (openModal) {
    const inputEl = openModal.querySelector("input[type='text'], input[type='number']");
    if (inputEl) {
      inputEl.focus();
      inputEl.value = String(value).trim();
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      inputEl.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
  }

  return safeInject(selectorList[0], value);
}

/**
 * Mencari tombol Simpan di dalam modal terbuka atau form tab
 */
function findSimpanButtonInModalOrTab() {
  const openModal = document.querySelector(".modal.in, .modal.show, .modal[style*='display: block']");
  if (openModal) {
    const buttons = Array.from(openModal.querySelectorAll("button, a.btn, input[type='button'], input[type='submit']"));
    const saveBtn = buttons.find(b => {
      const t = (b.textContent || b.value || "").toLowerCase();
      return t.includes("simpan") || t.includes("save");
    });
    if (saveBtn) return saveBtn;
  }

  const activePane = document.querySelector(".tab-pane.active, .tab-pane.in");
  if (activePane) {
    const btn = activePane.querySelector("#simpan_btn, button[id*='simpan']");
    if (btn) return btn;
  }

  return document.querySelector("#simpan_btn");
}

/**
 * Helper: Memilih Radio Button dan mentrigger event 'change'
 */
function safeCheckRadio(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`[PCare AutoFiller] [WARNING] Radio '${selector}' tidak ditemukan.`);
    return false;
  }
  element.checked = true;
  element.dispatchEvent(new Event("click", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/**
 * Helper: Mencentang Checkbox atau Radio Button secara aman
 */
function safeCheckRadioOrCheckbox(selector, checked = true) {
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`[PCare AutoFiller] [WARNING] Elemen '${selector}' tidak ditemukan.`);
    return false;
  }
  element.checked = checked;
  element.dispatchEvent(new Event("click", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/**
 * Helper: Aman mengisi nilai ke elemen input / textarea tanpa crash jika elemen telat render.
 */
function safeInject(selector, value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  const element = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!element) {
    console.warn(`[PCare AutoFiller] [WARNING] Input '${selector}' tidak ditemukan.`);
    return false;
  }

  element.focus();
  element.value = String(value).trim();

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

/**
 * Helper: Aman mengklik elemen
 */
function safeClick(selector) {
  const element = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!element) {
    console.warn(`[PCare AutoFiller] [WARNING] Tombol '${selector}' tidak ditemukan untuk diklik.`);
    return false;
  }
  element.click();
  return true;
}

/**
 * Helper: Aman memilih opsi pada dropdown (<select>) berdasarkan value atau label teks
 */
function safeSelect(selector, targetValueOrText) {
  if (!targetValueOrText) return false;

  const element = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!element) {
    console.warn(`[PCare AutoFiller] [WARNING] Dropdown '${selector}' tidak ditemukan.`);
    return false;
  }

  return selectOptionByTextOrValue(element, targetValueOrText);
}

/**
 * Logika pemilihan opsi pada elemen <select>
 */
function selectOptionByTextOrValue(selectEl, targetValueOrText) {
  if (!selectEl || !selectEl.options) return false;

  const targetStr = String(targetValueOrText).trim().toLowerCase();
  let found = false;

  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    const valLower = opt.value.trim().toLowerCase();
    const textLower = opt.text.trim().toLowerCase();

    if (valLower === targetStr || textLower === targetStr || textLower.includes(targetStr)) {
      selectEl.selectedIndex = i;
      selectEl.value = opt.value;
      found = true;
      break;
    }
  }

  if (!found) {
    selectEl.value = targetValueOrText;
  }

  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  selectEl.dispatchEvent(new Event("input", { bubbles: true }));

  if (window.jQuery && window.jQuery(selectEl).length) {
    window.jQuery(selectEl).val(selectEl.value).trigger("change");
  }

  return true;
}

/**
 * Helper: Promise delay (Sleep)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper UI: Menampilkan floating notification status langsung di layar portal PCare
 */
function showNotification(message, type = "info") {
  let notifEl = document.getElementById("pcare-autofill-notif");
  if (!notifEl) {
    notifEl = document.createElement("div");
    notifEl.id = "pcare-autofill-notif";
    notifEl.style.position = "fixed";
    notifEl.style.bottom = "24px";
    notifEl.style.right = "24px";
    notifEl.style.zIndex = "9999999";
    notifEl.style.padding = "12px 20px";
    notifEl.style.borderRadius = "8px";
    notifEl.style.fontSize = "13px";
    notifEl.style.fontWeight = "600";
    notifEl.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.25)";
    notifEl.style.transition = "all 0.3s ease";
    notifEl.style.fontFamily = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    const targetParent = document.body || document.documentElement;
    if (targetParent) {
      targetParent.appendChild(notifEl);
    }
  }

  const bgColors = {
    info: "#0284c7",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626"
  };

  notifEl.style.backgroundColor = bgColors[type] || bgColors.info;
  notifEl.style.color = "#ffffff";
  notifEl.textContent = `[PCare AutoFiller] ${message}`;
}
