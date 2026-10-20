/**
 * =========================================================================================
 * SISTEM OTOMASI GOOGLE SHEETS KE PCARE BPJS (TWO-WAY SYNC)
 * File: Code.gs (Google Apps Script)
 * Target Spreadsheet: 1wu6r36aA94-jBxWacNewjOXiaB_42p8FLYfaul6auOg
 * =========================================================================================
 * Petunjuk Deploy:
 * 1. Buka Google Sheets Anda.
 * 2. Klik Extensions (Ekstensi) > Apps Script.
 * 3. Hapus seluruh kode lama dan paste seluruh isi file ini ke file `Code.gs`.
 * 4. Klik ikon Disket (Save).
 * 5. PENTING: Klik tombol "Deploy" > "Manage deployments" > Edit (ikon pensil).
 * 6. Pada dropdown "Version", pilih "New version" (Wajib buat versi baru agar update aktif!).
 * 7. Klik tombol "Deploy" lalu salin "Web App URL" ke content.js.
 * =========================================================================================
 */

// Spreadsheet ID
const SPREADSHEET_ID = "1wu6r36aA94-jBxWacNewjOXiaB_42p8FLYfaul6auOg";

/**
 * Helper: Membuka spreadsheet berdasarkan SPREADSHEET_ID dengan fallback ke getActiveSpreadsheet()
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (err) {
      console.warn("Gagal membuka via SPREADSHEET_ID, menggunakan getActiveSpreadsheet():", err);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Helper: Mengarahkan ke sheet yang sesuai berdasarkan sheetParam atau sheetTargetParam
 * - 'PROLANIS' -> Sheet yang memuat kata 'PROLANIS'
 * - 'SKRINING' -> Sheet yang memuat kata 'SKRINING'
 * - 'PAPSMEAR' -> Sheet yang memuat kata 'PAPSMEAR'
 */
function resolveSheet(ss, sheetParam, sheetTargetParam) {
  if (sheetParam) {
    const s = ss.getSheetByName(sheetParam);
    if (s) return s;
  }

  const targetKey = String(sheetTargetParam || "").trim().toUpperCase();
  if (targetKey) {
    const allSheets = ss.getSheets();
    for (let i = 0; i < allSheets.length; i++) {
      const name = allSheets[i].getName().toUpperCase();
      if (targetKey === "PROLANIS" && name.includes("PROLANIS")) {
        return allSheets[i];
      }
      if (targetKey === "SKRINING" && (name.includes("SKRINING") || (name.includes("DM") && !name.includes("PROLANIS")))) {
        return allSheets[i];
      }
      if (targetKey === "PAPSMEAR" && (name.includes("PAP") || name.includes("SMEAR"))) {
        return allSheets[i];
      }
    }

    // Fallback pencarian parsial nama sheet
    for (let i = 0; i < allSheets.length; i++) {
      const name = allSheets[i].getName().toUpperCase();
      if (name.includes(targetKey)) {
        return allSheets[i];
      }
    }
  }

  return ss.getActiveSheet();
}

/**
 * Menangani permintaan HTTP GET dari Ekstensi Chrome
 * - Modul 1 (Pendaftaran): Mengambil pasien yang Kolom C / TGL ENTRI masih KOSONG
 * - Modul 2 (Kunjungan / Input Hasil):
 *     1. Kolom C / TGL ENTRI HARUS ADA ISINYA (sudah terdaftar)
 *     2. Memiliki minimal 1 data hasil lab non-kosong (CHO, TG, GDP, HBA1C, dll)
 *     3. Background baris BELUM BERWARNA MERAH/SALEM (#F4CCCC / #E6B8AF)
 */
function doGet(e) {
  try {
    const ss = getSpreadsheet();
    const sheetTargetParam = (e && e.parameter && (e.parameter.sheetTarget || e.parameter.targetSheet))
      ? String(e.parameter.sheetTarget || e.parameter.targetSheet).trim()
      : "";
    const sheetParam = (e && e.parameter && e.parameter.sheet) ? String(e.parameter.sheet).trim() : "";
    const sheet = resolveSheet(ss, sheetParam, sheetTargetParam);

    const lastRow = sheet.getLastRow();

    // Validasi baris data (data dimulai dari baris 9)
    if (lastRow < 9) {
      return createJsonResponse({
        status: "success",
        total: 0,
        message: "Tidak ada baris data pasien (data dimulai dari baris 9).",
        data: []
      });
    }

    // Ambil Header pada Baris 1 & Baris 7 (Mencakup minimal 45 kolom hingga Kolom AO)
    const totalCols = Math.max(sheet.getLastColumn(), 45);
    const headersRow1 = sheet.getRange(1, 1, 1, totalCols).getValues()[0];
    const headers = sheet.getRange(7, 1, 1, totalCols).getValues()[0];

    // Ambil Data & Backgrounds mulai dari Baris 9 sampai baris terakhir
    const totalDataRows = lastRow - 8;
    const dataValues = sheet.getRange(9, 1, totalDataRows, totalCols).getValues();
    const backgrounds = sheet.getRange(9, 1, totalDataRows, 4).getBackgrounds(); // Cek warna baris (Kolom A s/d D)

    // Helper: Konversi nilai tanggal (String / Date Object) ke format standar DD-MM-YYYY
    function toStandardDDMMYYYY(val) {
      if (!val) return "";
      if (val instanceof Date && !isNaN(val.getTime())) {
        const d = String(val.getDate()).padStart(2, "0");
        const m = String(val.getMonth() + 1).padStart(2, "0");
        const y = val.getFullYear();
        return `${d}-${m}-${y}`;
      }
      const str = String(val).trim();
      const indonesianMonths = {
        januari: "01", februari: "02", maret: "03", april: "04", mei: "05", juni: "06",
        juli: "07", agustus: "08", september: "09", oktober: "10", november: "11", desember: "12",
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
      };
      const matchIndo = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (matchIndo) {
        const d = matchIndo[1].padStart(2, "0");
        const m = indonesianMonths[matchIndo[2].toLowerCase()] || "01";
        const y = matchIndo[3];
        return `${d}-${m}-${y}`;
      }
      // Bersihkan waktu atau timestamp jika ada (misal "1/10/2026 00:00:00" atau "01-10-2026T00:00:00")
      const cleanDateStr = str.split(/[T\s]+/)[0].trim();
      const matchDDMM = cleanDateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (matchDDMM) {
        const d = matchDDMM[1].padStart(2, "0");
        const m = matchDDMM[2].padStart(2, "0");
        let y = matchDDMM[3];
        if (y.length === 2) y = "20" + y;
        return `${d}-${m}-${y}`;
      }
      const matchISO = cleanDateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (matchISO) {
        const y = matchISO[1];
        const m = matchISO[2].padStart(2, "0");
        const d = matchISO[3].padStart(2, "0");
        return `${d}-${m}-${y}`;
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const d = String(parsed.getDate()).padStart(2, "0");
        const m = String(parsed.getMonth() + 1).padStart(2, "0");
        const y = parsed.getFullYear();
        return `${d}-${m}-${y}`;
      }
      return str.toLowerCase();
    }

    const indonesianMonthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    // Helper: Menambahkan 1 hari ke nilai tanggal dengan penanganan rollover akhir bulan yang akurat
    function getNextDayFormatted(rawDateVal) {
      if (!rawDateVal) return "";
      let dObj = null;
      let wasIndoText = false;

      if (rawDateVal instanceof Date && !isNaN(rawDateVal.getTime())) {
        dObj = new Date(rawDateVal.getTime());
      } else {
        const str = String(rawDateVal).trim();
        const indonesianMonths = {
          januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
          juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const matchIndo = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
        if (matchIndo) {
          wasIndoText = true;
          const d = parseInt(matchIndo[1], 10);
          const m = indonesianMonths[matchIndo[2].toLowerCase()] !== undefined ? indonesianMonths[matchIndo[2].toLowerCase()] : 0;
          const y = parseInt(matchIndo[3], 10);
          dObj = new Date(y, m, d);
        } else {
          const matchDDMM = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (matchDDMM) {
            const d = parseInt(matchDDMM[1], 10);
            const m = parseInt(matchDDMM[2], 10) - 1;
            const y = parseInt(matchDDMM[3], 10);
            dObj = new Date(y, m, d);
          } else {
            const matchISO = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (matchISO) {
              const y = parseInt(matchISO[1], 10);
              const m = parseInt(matchISO[2], 10) - 1;
              const d = parseInt(matchISO[3], 10);
              dObj = new Date(y, m, d);
            } else {
              const parsed = new Date(str);
              if (!isNaN(parsed.getTime())) {
                dObj = parsed;
              }
            }
          }
        }
      }

      if (!dObj || isNaN(dObj.getTime())) return "";

      // Tambahkan 1 hari (otomatis menangani akhir bulan, leap year, dan pergantian tahun)
      dObj.setDate(dObj.getDate() + 1);

      // Jika jatuh pada hari MINGGU (getDay() === 0), lewati hari libur faskes ke hari SENIN
      if (dObj.getDay() === 0) {
        dObj.setDate(dObj.getDate() + 1);
      }

      const d = String(dObj.getDate()).padStart(2, "0");
      const m = String(dObj.getMonth() + 1).padStart(2, "0");
      const y = dObj.getFullYear();

      if (wasIndoText) {
        return `${dObj.getDate()} ${indonesianMonthNames[dObj.getMonth()]} ${y}`;
      }
      return `${d}-${m}-${y}`;
    }

    // Helper: Deteksi warna latar belakang merah muda / salem selesai
    function isRedOrSalem(colorHex) {
      if (!colorHex) return false;
      const upper = String(colorHex).trim().toUpperCase();
      return upper === "#F4CCCC" || upper === "#E6B8AF" || upper.includes("F4CCCC") || upper.includes("E6B8AF");
    }

    // Helper: Validasi angka hasil lab secara ketat (mencegah nilai 'false', 'Baru', 'Promotif Preventif', dll)
    function isValidLabNumber(val) {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      if (str === '' || str.toLowerCase() === 'false' || str.toLowerCase() === 'true' || str.toLowerCase() === 'baru') return false;
      // Loloskan angka murni atau angka dengan format desimal titik/koma serta simbol < / >
      return /^[<>]?\s*\d+([.,]\d+)?\s*(\*)?$/.test(str);
    }

    /**
     * PETA INDEKS KOLOM BERDASARKAN STRUKTUR HEADER ASLI (0-based):
     * Kolom C (idx 2)  : TGL ENTRI (Filter & Sinkronisasi Dua Arah)
     * Kolom D (idx 3)  : NO BPJS
     * Kolom E (idx 4)  : NAMA PESERTA
     * Kolom F (idx 5)  : ALAMAT
     * Kolom G (idx 6)  : FKTP
     * Kolom H (idx 7)  : TENSI (Contoh: "137/89")
     * Kolom I (idx 8)  : TB (Tinggi Badan, Contoh: 156)
     * Kolom J (idx 9)  : BB (Berat Badan, Contoh: 73)
     * Kolom K (idx 10) : LP (Lingkar Perut, Contoh: 87)
     * Kolom L (idx 11) : RR (Respiratory Rate, Contoh: 24, 23)
     * Kolom M (idx 12) : HR (Heart Rate, Contoh: 81, 83)
     * Kolom N (idx 13) : CHO (Kolesterol Total)
     * Kolom O (idx 14) : TG (Trigliserida)
     * Kolom P (idx 15) : HDL
     * Kolom Q (idx 16) : LDL
     * Kolom R (idx 17) : UR (Ureum)
     * Kolom S (idx 18) : CRE (Kreatinin)
     * Kolom T (idx 19) : MAU (Microalbuminuria)
     * Kolom U (idx 20) : HBA1C (HbA1c)
     * Kolom V (idx 21) : GDP (Gula Darah Puasa) -> kode 05049
     * Kolom W (idx 22) : GDPP (Gula Darah 2 Jam PP) -> kode 05050
     * Kolom X (idx 23) : GDS (Gula Darah Sewaktu) -> kode 05048
     * Kolom Y / AC     : Keluhan
     * Kolom Z / AD     : Jam Kunjungan (Default: "07:00")
     * Kolom AA / AE    : Anamnesa
     * Kolom AE / AI    : Diagnosa (Contoh: "e11.9" / "i10")
     * Kolom AF / AJ    : Suhu (Default: "36.0")
     * Kolom AO / AP    : Pelayanan Non Kapitasi / Status Pulang
     */

    // Helper pencarian dinamis: prioritaskan header baris 1, lalu baris 7, dengan fallback indeks pasti
    function getColIdx(headerNames, defaultIdx) {
      // 1. Cek baris 1 terlebih dahulu (prioritas utama nama header baris 1)
      if (headersRow1 && headersRow1.length > 0) {
        for (let c = 0; c < headersRow1.length; c++) {
          const text = headersRow1[c] ? String(headersRow1[c]).trim().toUpperCase() : "";
          if (!text) continue;
          for (let name of headerNames) {
            const target = String(name).trim().toUpperCase();
            if (text === target || text.startsWith(target) || text.includes(target)) {
              return c;
            }
          }
        }
      }
      // 2. Cek baris 7
      if (headers && headers.length > 0) {
        for (let c = 0; c < headers.length; c++) {
          const text = headers[c] ? String(headers[c]).trim().toUpperCase() : "";
          if (!text) continue;
          for (let name of headerNames) {
            const target = String(name).trim().toUpperCase();
            if (text === target || text.startsWith(target) || text.includes(target)) {
              return c;
            }
          }
        }
      }
      return defaultIdx;
    }

    const sheetNameUpper = sheet.getName().toUpperCase();
    const isPapSmearSheet = sheetNameUpper.includes("PAP") || sheetNameUpper.includes("SMEAR") || (sheetTargetParam && sheetTargetParam.toUpperCase() === "PAPSMEAR");

    // Pemetaan khusus kolom tanggal & data pasien:
    // Tab PROLANIS / SKRINING:
    // - Kolom B (idx 1): TGL PLY
    // - Kolom C (idx 2): TGL ENTRI
    // - Kolom D (idx 3): NO BPJS
    // - Kolom E (idx 4): NAMA PESERTA
    // Tab PAPSMEAR:
    // - Kolom B (idx 1): TGL PLY
    // - Kolom C (idx 2): TGL HASIL
    // - Kolom D (idx 3): TGL ENTRI
    // - Kolom E (idx 4): NO BPJS
    // - Kolom F (idx 5): NAMA PESERTA
    const defaultIdxTglPly = 1;
    const defaultIdxTglHasil = isPapSmearSheet ? 2 : -1;
    const defaultIdxTglEntri = isPapSmearSheet ? 3 : 2;
    const defaultIdxBpjs = isPapSmearSheet ? 4 : 3;
    const defaultIdxNama = isPapSmearSheet ? 5 : 4;

    let idxTglPly = getColIdx(["TGL PELAYANAN", "TGL PLY", "TANGGAL PELAYANAN", "TGL PERIKSA", "TANGGAL PERIKSA", "TGL", "TANGGAL"], defaultIdxTglPly);
    let idxTglHasil = getColIdx(["TGL HASIL", "TANGGAL HASIL", "TGL_HASIL"], defaultIdxTglHasil);
    let idxTglEntri = getColIdx(["TGL ENTRI", "TANGGAL ENTRI", "TGL ENTRY", "TANGGAL ENTRY", "TGL_ENTRI"], defaultIdxTglEntri);
    let idxBpjs = getColIdx(["NO BPJS", "NO. BPJS", "NO KARTU", "NOMOR KARTU"], defaultIdxBpjs);
    let idxNama = getColIdx(["NAMA PESERTA", "NAMA"], defaultIdxNama);

    // Pemetaan kolom khusus tab Pap Smear:
    // Kolom B (index 1): TGL PLY, Kolom C (index 2): TGL HASIL, Kolom D (index 3): TGL ENTRI, Kolom E (index 4): NO BPJS
    if (isPapSmearSheet) {
      idxTglPly = 1;   // Kolom B (index 1): TGL PLY
      idxTglHasil = 2; // Kolom C (index 2): TGL HASIL
      idxTglEntri = 3; // Kolom D (index 3): TGL ENTRI
      idxBpjs = 4;     // Default Kolom E (index 4): NO BPJS
      if (idxNama <= 4) idxNama = 5; // Default Kolom F (index 5): NAMA

      // Deteksi adaptif jika Kolom D berisi nomor BPJS (13 digit) dan Kolom E berisi teks nama
      let colDIsBpjsCount = 0;
      for (let s = 0; s < Math.min(dataValues.length, 10); s++) {
        const valD = String(dataValues[s][3] || "").replace(/\D/g, "");
        const valE = String(dataValues[s][4] || "").trim();
        if (valD.length >= 10 && valE.length > 2 && /[A-Za-z]/.test(valE)) {
          colDIsBpjsCount++;
        }
      }
      if (colDIsBpjsCount > 0) {
        idxBpjs = 3; // Gunakan Kolom D sebagai NO BPJS
        idxNama = 4; // Gunakan Kolom E sebagai NAMA
      }
    }

    const idxTensi = getColIdx(["TENSI", "TEKANAN DARAH"], 7);             // Kolom H
    const idxTb = getColIdx(["TB", "TINGGI BADAN"], 8);                    // Kolom I
    const idxBb = getColIdx(["BB", "BERAT BADAN"], 9);                     // Kolom J
    const idxLp = getColIdx(["LP", "LINGKAR PERUT"], 10);                  // Kolom K
    const idxRr = getColIdx(["RR", "RESPIRATORY RATE", "RESP"], 11);       // Kolom L
    const idxHr = getColIdx(["HR", "HEART RATE", "NADI"], 12);             // Kolom M

    // Parameter Lab (Mulai N=13 s/d X=23)
    const idxCho = getColIdx(["CHO", "KOLESTEROL TOTAL", "CHOL", "KOLESTEROL"], 13); // Kolom N (13)
    const idxTg = getColIdx(["TG", "TRIGLISERIDA", "TRIGLYCERIDE"], 14);            // Kolom O (14)
    const idxHdl = getColIdx(["HDL", "KOLESTEROL HDL"], 15);                       // Kolom P (15)
    const idxLdl = getColIdx(["LDL", "KOLESTEROL LDL"], 16);                       // Kolom Q (16)
    const idxUr = getColIdx(["UR", "UREUM", "UREA"], 17);                          // Kolom R (17)
    const idxCre = getColIdx(["CRE", "CREATININ", "KREATININ"], 18);               // Kolom S (18)
    const idxMau = getColIdx(["MAU", "MICROALBUMINURIA", "MICRO ALBUMIN"], 19);    // Kolom T (19)
    const idxHba1c = getColIdx(["HBA1C", "HB A1C", "A1C"], 20);                   // Kolom U (20)
    const idxGdp = getColIdx(["GDP", "GLUKOSA PUASA", "GULA PUASA"], 21);          // Kolom V (21)
    const idxGdpp = getColIdx(["GDPP", "GLUKOSA 2 JAM PP", "2 JAM PP", "GULA 2 JAM"], 22); // Kolom W (22)
    const idxGds = getColIdx(["GDS", "GLUKOSA SEWAKTU", "GULA SEWAKTU"], 23);     // Kolom X (23)

    // Deteksi tata letak default kolom diagnosa & keluhan berdasarkan nama sheet aktif:
    let defaultIdxDiagnosa = 34; // Tab PROLANIS: Diagnosa Kolom AI (index 34)
    let defaultIdxKeluhan = 29;  // Tab PROLANIS: Keluhan Kolom AD (index 29)

    if (sheetNameUpper.includes("SKRINING") || (sheetNameUpper.includes("DM") && !sheetNameUpper.includes("PROLANIS"))) {
      defaultIdxDiagnosa = 24; // Kolom Y (Skrining DM)
      defaultIdxKeluhan = 19;  // Kolom T (Skrining DM)
    } else if (isPapSmearSheet) {
      defaultIdxDiagnosa = 25; // Kolom Z (Pap Smear)
      defaultIdxKeluhan = 20;  // Kolom U (Pap Smear)
    } else {
      defaultIdxDiagnosa = 34; // Kolom AI (Prolanis)
      defaultIdxKeluhan = 29;  // Kolom AD (Prolanis)
    }

    // Data Kunjungan & Klinis (Prioritas Header Baris 1 -> Baris 7 -> Fallback Tab Aktif)
    const idxKeluhan = getColIdx(["KELUHAN", "KELUHAN UTAMA"], defaultIdxKeluhan);
    const idxJam = getColIdx(["JAM KUNJUNGAN", "JAM KUNJUNG"], 25);                // Kolom Z / AD (hindari mencocokkan '2 JAM PP')
    const idxAnamnesa = getColIdx(["ANAMNESA", "ANAMNESIS"], 26);          // Kolom AA / AE
    const idxDiagnosa = getColIdx(["DIAGNOSA", "KODE DIAGNOSA", "ICD10", "ICD-10", "DIAGNOSIS"], defaultIdxDiagnosa);
    const idxSuhu = getColIdx(["SUHU", "TEMPERATUR"], 31);                 // Kolom AF / AJ
    const idxPelayananNonKap = getColIdx(["PELAYANAN NON KAPITASI", "NON KAPITASI", "PELAYANAN NON", "PELAYANAN"], 40); // Kolom AO / AP

    // Cek parameter request dari Chrome Extension
    const actionParam = (e && e.parameter && (e.parameter.action || e.parameter.type))
      ? String(e.parameter.action || e.parameter.type).toLowerCase()
      : "";
    const isKunjunganMode = actionParam === "getkunjungan" || actionParam === "kunjungan" || actionParam === "inputhasil";

    // Parameter opsional: Filter tanggal entri (?tgl=... atau ?tanggal=...)
    const targetTglParam = (e && e.parameter && (e.parameter.tgl || e.parameter.tanggal))
      ? String(e.parameter.tgl || e.parameter.tanggal).trim()
      : "";

    // Tentukan tanggal target untuk Modul 2
    let targetDateStandard = "";
    if (isKunjunganMode) {
      if (targetTglParam) {
        if (targetTglParam.toLowerCase() === "all" || targetTglParam === "*") {
          targetDateStandard = ""; // Bypass filter tanggal jika user eksplisit meminta semua
        } else {
          targetDateStandard = toStandardDDMMYYYY(targetTglParam);
        }
      } else {
        // Jika targetTglParam KOSONG: Pindai dari atas ke bawah untuk mencari baris data pertama
        // yang belum selesai (background BUKAN #F4CCCC atau #E6B8AF) dan memiliki TGL ENTRI.
        // Dengan begitu, jika ada pasien kuning/belum selesai di tanggal teratas (misal 01-10-2026),
        // backend otomatis mengunci targetDateStandard ke tanggal tersebut sampai tuntas!
        for (let i = 0; i < dataValues.length; i++) {
          const isDone = isRedOrSalem(backgrounds[i][0]) || isRedOrSalem(backgrounds[i][1]) || isRedOrSalem(backgrounds[i][2]);
          if (!isDone) {
            const cVal = dataValues[i][idxTglEntri];
            if (cVal && formatCellValue(cVal) !== "") {
              const std = toStandardDDMMYYYY(cVal);
              if (std) {
                targetDateStandard = std;
                break;
              }
            } else if (isPapSmearSheet) {
              const pDate = toStandardDDMMYYYY(dataValues[i][2]) || toStandardDDMMYYYY(dataValues[i][idxTglPly]);
              if (pDate) {
                targetDateStandard = pDate;
                break;
              }
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // LACAK PASIEN GANDA PADA TANGGAL SAMA (H+1 AUTO-SHIFT)
    // -------------------------------------------------------------
    // Map frekuensi kemunculan: key = `${noBpjs}_${tglPly}`
    const patientSameDayFrequency = {};
    for (let r = 0; r < dataValues.length; r++) {
      const bVal = dataValues[r][idxBpjs];
      if (!bVal) continue;
      const bStr = String(bVal).trim().padStart(13, "0");
      const pDate = toStandardDDMMYYYY(dataValues[r][idxTglPly]);
      if (bStr && pDate) {
        const k = `${bStr}_${pDate}`;
        patientSameDayFrequency[k] = (patientSameDayFrequency[k] || 0) + 1;
      }
    }

    const seenSameDayOrder = {};
    const patientRecords = [];

    for (let i = 0; i < dataValues.length; i++) {
      const row = dataValues[i];
      const currentRowNumber = i + 9;
      const rowBg = String(backgrounds[i][0] || "").trim().toUpperCase();

      let actualRowBpjsIdx = idxBpjs;
      let actualRowNamaIdx = idxNama;
      if (isPapSmearSheet) {
        const dDigits = String(row[3] || "").replace(/\D/g, "");
        const eVal = String(row[4] || "").trim();
        if (dDigits.length >= 10 && eVal.length > 2 && /[A-Za-z]/.test(eVal)) {
          actualRowBpjsIdx = 3;
          actualRowNamaIdx = 4;
        }
      }

      const noBpjsRaw = row[actualRowBpjsIdx];
      const noBpjsClean = (noBpjsRaw !== null && noBpjsRaw !== undefined) ? String(noBpjsRaw).trim() : "";
      // Rule: Abaikan/skip baris jika kolom NO BPJS kosong
      if (!noBpjsClean) {
        continue;
      }
      const noBpjs = noBpjsClean.padStart(13, "0");

      const tglPlyRaw = row[idxTglPly];
      const tglPlyClean = toStandardDDMMYYYY(tglPlyRaw) || formatCellValue(tglPlyRaw);
      const tglPlyStd = toStandardDDMMYYYY(tglPlyRaw);

      const tglHasilRaw = (idxTglHasil >= 0 && row[idxTglHasil] !== undefined) ? row[idxTglHasil] : (isPapSmearSheet ? row[2] : "");
      const tglHasilClean = toStandardDDMMYYYY(tglHasilRaw) || formatCellValue(tglHasilRaw);

      const tglEntriRaw = row[idxTglEntri];
      const tglEntriClean = formatCellValue(tglEntriRaw);

      // Lacak urutan kemunculan pasien pada hari yang sama (No BPJS & tglPly)
      const sameDayKey = (noBpjs && tglPlyStd) ? `${noBpjs}_${tglPlyStd}` : "";
      if (sameDayKey) {
        seenSameDayOrder[sameDayKey] = (seenSameDayOrder[sameDayKey] || 0) + 1;
      }
      const orderIndex = sameDayKey ? seenSameDayOrder[sameDayKey] : 1;
      const totalSameDayCount = sameDayKey ? (patientSameDayFrequency[sameDayKey] || 1) : 1;

      // Deteksi indikasi baris Skrining DM (diagnosa z13.1, keluhan skrining dm, atau tindakan gula darah)
      const rawDiagStr = formatCellValue(row[idxDiagnosa] !== undefined ? row[idxDiagnosa] : row[defaultIdxDiagnosa]).toLowerCase().replace(/\s+/g, "");
      const rawKelStr = formatCellValue(row[idxKeluhan] !== undefined ? row[idxKeluhan] : row[defaultIdxKeluhan]).toLowerCase();
      const rawPelStr = formatCellValue(row[idxPelayananNonKap] !== undefined ? row[idxPelayananNonKap] : row[40]).toLowerCase();
      const isSkriningIndication = (
        rawDiagStr === "z13.1" || rawDiagStr === "z131" ||
        rawKelStr.includes("skrining") ||
        rawPelStr.includes("skrining") || rawPelStr.includes("penapisan")
      );

      // Evaluasi apakah baris ini adalah duplikat pada hari yang sama:
      // - Muncul setelah baris pertama (orderIndex > 1)
      // - Atau total kemunculan > 1 dan baris ini mengindikasikan skrining gula darah
      let isDuplicateSameDay = false;
      if (totalSameDayCount > 1) {
        if (orderIndex > 1 || isSkriningIndication) {
          isDuplicateSameDay = true;
        }
      }

      // Hitung tanggal H+1 (tglOffset) jika terdeteksi pasien ganda
      const tglOffset = isDuplicateSameDay ? getNextDayFormatted(tglPlyRaw || tglPlyClean) : "";

      // Penentuan effectiveDate:
      // - Khusus tab PAPSMEAR: gunakan tglHasil || tglPly
      // - Tab lain (PROLANIS & SKRINING):
      //   * Jika kolom TGL ENTRI sudah diisi manual di spreadsheet: prioritaskan nilai manual tersebut
      //   * Jika TGL ENTRI kosong:
      //     - Jika isDuplicateSameDay === true: gunakan patient.tglOffset (H+1)
      //     - Jika pasien normal: gunakan patient.tglPly
      let effectiveDate = "";
      if (isPapSmearSheet) {
        effectiveDate = tglHasilClean || tglPlyClean;
      } else {
        if (tglEntriClean !== "") {
          effectiveDate = tglEntriClean;
        } else if (isDuplicateSameDay && tglOffset) {
          effectiveDate = tglOffset;
        } else {
          effectiveDate = tglPlyClean;
        }
      }

      // -------------------------------------------------------------
      // 1. FILTER BERDASARKAN MODE OPERASI
      // -------------------------------------------------------------

      if (!isKunjunganMode) {
        // MODUL 1 (PENDAFTARAN):
        // HANYA ambil baris yang Kolom TGL ENTRI masih KOSONG
        if (tglEntriClean !== "") {
          continue;
        }
      } else {
        // MODUL 2 (ENTRI KUNJUNGAN & INPUT HASIL LAB):
        // a. Background baris BELUM BERWARNA MERAH/SALEM (#F4CCCC / #E6B8AF)
        const isAlreadyCompleted =
          isRedOrSalem(backgrounds[i][0]) ||
          isRedOrSalem(backgrounds[i][1]) ||
          isRedOrSalem(backgrounds[i][2]) ||
          isRedOrSalem(backgrounds[i][3]);

        if (isAlreadyCompleted) {
          continue; // Pasien sudah selesai diinput hasil labnya
        }

        if (isPapSmearSheet) {
          // Khusus Tab PAPSMEAR:
          // Jika Kolom D (TGL ENTRI) sudah terisi tanggal hasil dari HASIL_SELESAI, lewati
          if (tglEntriClean !== "") {
            continue;
          }

          // Filter Tanggal pada tab PAPSMEAR: cocokkan target tanggal dengan effectiveDate (tglHasil || tglPly)
          if (targetDateStandard) {
            const rowDateStd = toStandardDDMMYYYY(effectiveDate);
            if (rowDateStd !== targetDateStandard) {
              continue;
            }
          }
        } else {
          // Tab PROLANIS & SKRINING:
          // Kolom TGL ENTRI HARUS ADA ISINYA (hanya pasien yang sudah terdaftar)
          if (tglEntriClean === "") {
            if (!sheetNameUpper.includes("SKRINING")) {
              continue;
            }
          }

          // Filter Tanggal: Hanya proses baris yang tanggal entri-nya cocok dengan target tanggal
          if (targetDateStandard) {
            const rowDateStandard = toStandardDDMMYYYY(tglEntriRaw) || toStandardDDMMYYYY(effectiveDate) || toStandardDDMMYYYY(tglPlyRaw);
            if (rowDateStandard !== targetDateStandard) {
              continue;
            }
          }
        }
      }

      // 3. Parameter Lab (Mulai dari indeks 13 (N) sampai 23 (X))
      // Periksa dan validasi angka ketat (mencegah 'false', 'Baru', 'Promotif Preventif', dll)
      const rawCho = formatCellValue(row[idxCho]); // Kolom N (13)
      const rawTg = formatCellValue(row[idxTg]);   // Kolom O (14)
      const rawHdl = formatCellValue(row[idxHdl]); // Kolom P (15)
      const rawLdl = formatCellValue(row[idxLdl]); // Kolom Q (16)
      const rawUr = formatCellValue(row[idxUr]);   // Kolom R (17)
      const rawCre = formatCellValue(row[idxCre]); // Kolom S (18)
      const rawMau = formatCellValue(row[idxMau]); // Kolom T (19)
      const rawHba1c = formatCellValue(row[idxHba1c]); // Kolom U (20)
      const rawGdp = formatCellValue(row[idxGdp]); // Kolom V (21)
      const rawGdpp = formatCellValue(row[idxGdpp]); // Kolom W (22)
      const rawGds = formatCellValue(row[idxGds]); // Kolom X (23)

      let choVal = isValidLabNumber(rawCho) ? rawCho : "";
      let tgVal = isValidLabNumber(rawTg) ? rawTg : "";
      let hdlVal = isValidLabNumber(rawHdl) ? rawHdl : "";
      let ldlVal = isValidLabNumber(rawLdl) ? rawLdl : "";
      let urVal = isValidLabNumber(rawUr) ? rawUr : "";
      let creVal = isValidLabNumber(rawCre) ? rawCre : "";
      let mauVal = isValidLabNumber(rawMau) ? rawMau : "";
      let hba1cVal = isValidLabNumber(rawHba1c) ? rawHba1c : "";
      let gdpVal = isValidLabNumber(rawGdp) ? rawGdp : "";
      let gdppVal = isValidLabNumber(rawGdpp) ? rawGdpp : "";
      let gdsVal = isValidLabNumber(rawGds) ? rawGds : "";

      // c. Filter Khusus Modul 2: Memiliki minimal 1 data lab valid non-kosong ATAU baris tab khusus (Papsmear / Skrining DM)
      const hasAnyLab = Boolean(
        choVal || tgVal || hdlVal || ldlVal || urVal || creVal || mauVal ||
        hba1cVal || gdpVal || gdppVal || gdsVal
      );

      const isSpecialSheet = sheetNameUpper.includes("PAP") || sheetNameUpper.includes("SMEAR") || sheetNameUpper.includes("SKRINING");
      const diagCleanCheck = formatCellValue(row[idxDiagnosa]).toLowerCase().replace(/\s+/g, "");
      const isSpecialDiag = diagCleanCheck === "z12.4" || diagCleanCheck === "z13.1";

      if (isKunjunganMode && !hasAnyLab && !isSpecialSheet && !isSpecialDiag) {
        continue; // Lewati jika seluruh kolom hasil lab kosong / tidak valid
      }

      // 4. Format Tensi, Sistole, dan Diastole (Kolom H)
      const tensiRaw = formatCellValue(row[idxTensi]);
      let sistole = "120";
      let diastole = "80";

      if (tensiRaw && tensiRaw.includes("/")) {
        const parts = tensiRaw.split("/");
        sistole = parts[0] ? parts[0].trim() : "120";
        diastole = parts[1] ? parts[1].trim() : "80";
      } else if (tensiRaw) {
        sistole = tensiRaw.trim();
        diastole = "80";
      }

      // 5. Data Fisik Pasien (Kolom I, J, K, L, M)
      const tbVal = formatCellValue(row[idxTb]);
      const bbVal = formatCellValue(row[idxBb]);
      const lpVal = formatCellValue(row[idxLp]); // Kolom K (contoh: 87, 92)
      const rrVal = formatCellValue(row[idxRr]); // Kolom L (contoh: 24, 23)
      const hrVal = formatCellValue(row[idxHr]); // Kolom M (contoh: 81, 83)

      // 6. Data Kunjungan & Klinis (Dinamis Lintas Tab)
      let keluhanVal = formatCellValue(row[idxKeluhan]);
      const jamKunjunganVal = "07:00"; // Wajib jam 07:00 pasti untuk seluruh baris data entri kunjungan
      const anamnesaVal = formatCellValue(row[idxAnamnesa]);
      let diagnosaVal = formatCellValue(row[idxDiagnosa]);
      const suhuVal = formatCellValue(row[idxSuhu]) || "36.0";

      // Fallback nilai diagnosa per tab jika cell pada idxDiagnosa masih kosong
      if (!diagnosaVal) {
        if (sheetNameUpper.includes("SKRINING") && formatCellValue(row[24])) {
          diagnosaVal = formatCellValue(row[24]); // Kolom Y (Skrining DM)
        } else if ((sheetNameUpper.includes("PAP") || sheetNameUpper.includes("SMEAR")) && formatCellValue(row[25])) {
          diagnosaVal = formatCellValue(row[25]); // Kolom Z (Pap Smear)
        } else if (formatCellValue(row[34])) {
          diagnosaVal = formatCellValue(row[34]); // Kolom AI (Prolanis)
        }
      }

      // Fallback nilai keluhan per tab jika cell pada idxKeluhan masih kosong
      if (!keluhanVal) {
        if (sheetNameUpper.includes("SKRINING") && formatCellValue(row[19])) {
          keluhanVal = formatCellValue(row[19]); // Kolom T (Skrining DM)
        } else if ((sheetNameUpper.includes("PAP") || sheetNameUpper.includes("SMEAR")) && formatCellValue(row[20])) {
          keluhanVal = formatCellValue(row[20]); // Kolom U (Pap Smear)
        } else if (formatCellValue(row[29])) {
          keluhanVal = formatCellValue(row[29]); // Kolom AD (Prolanis)
        }
      }

      // 7. Deteksi Opsi Perawatan
      let perawatanVal = "Promotif Preventif";
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const hName = headers[colIdx] ? String(headers[colIdx]).toLowerCase() : "";
        if (hName.includes("perawatan") || hName.includes("status rawat")) {
          const val = formatCellValue(row[colIdx]);
          if (val) perawatanVal = val;
          break;
        }
      }

      const kimiaDarah = {
        CHO: choVal,
        TG: tgVal,
        HDL: hdlVal,
        LDL: ldlVal,
        UR: urVal,
        CRE: creVal,
        MAU: mauVal
      };

      const gulaDarah = {
        GDP: gdpVal,
        GDPP: gdppVal,
        GDS: gdsVal
      };

      const pelayananNonKapVal = formatCellValue(row[idxPelayananNonKap] !== undefined ? row[idxPelayananNonKap] : row[40]);
      const rawNoAntrean = formatCellValue(row[0]); // Ambil nomor antrean asli langsung dari Kolom A (index 0)

      // Susun record data terstruktur untuk dikirim ke ekstensi Chrome
      patientRecords.push({
        rowNumber: currentRowNumber,
        noAntrean: rawNoAntrean,
        antrean: rawNoAntrean,
        sheetName: sheet.getName(),
        tglPly: tglPlyClean,
        tglHasil: tglHasilClean,
        effectiveDate: effectiveDate,
        isDuplicateSameDay: isDuplicateSameDay,
        tglOffset: tglOffset,
        tglEntri: tglEntriClean,
        noBpjs: noBpjs,
        nama: formatCellValue(row[actualRowNamaIdx]),
        tensi: tensiRaw,
        sistole: sistole,
        diastole: diastole,
        tb: tbVal,
        bb: bbVal,
        lp: lpVal,
        rr: rrVal,
        hr: hrVal,
        keluhan: keluhanVal,
        jamKunjungan: jamKunjunganVal,
        anamnesa: anamnesaVal,
        diagnosa: diagnosaVal,
        suhu: suhuVal,
        perawatan: perawatanVal,
        pelayananNonKapitasi: pelayananNonKapVal,
        hba1c: hba1cVal,
        cho: choVal,
        tg: tgVal,
        hdl: hdlVal,
        ldl: ldlVal,
        ur: urVal,
        cre: creVal,
        mau: mauVal,
        gdp: gdpVal,
        gdpp: gdppVal,
        gds: gdsVal,
        kimiaDarah: kimiaDarah,
        gulaDarah: gulaDarah,
        labResults: {
          cho: choVal,
          tg: tgVal,
          hdl: hdlVal,
          ldl: ldlVal,
          ur: urVal,
          cre: creVal,
          mau: mauVal,
          hba1c: hba1cVal,
          gdp: gdpVal,
          gdpp: gdppVal,
          gds: gdsVal
        },
        // Raw mapping berdasar abjad kolom (hingga AO)
        rawCols: {
          A: rawNoAntrean,
          B: tglPlyClean,
          C: isPapSmearSheet ? tglHasilClean : tglEntriClean,
          D: isPapSmearSheet ? (actualRowBpjsIdx === 3 ? noBpjs : tglEntriClean) : noBpjs,
          E: isPapSmearSheet ? (actualRowBpjsIdx === 3 ? formatCellValue(row[actualRowNamaIdx]) : noBpjs) : formatCellValue(row[4]),
          F: isPapSmearSheet ? (actualRowBpjsIdx === 3 ? formatCellValue(row[5]) : formatCellValue(row[actualRowNamaIdx])) : formatCellValue(row[5]),
          tglHasil: tglHasilClean,
          effectiveDate: effectiveDate,
          isDuplicateSameDay: isDuplicateSameDay,
          tglOffset: tglOffset,
          G: formatCellValue(row[6]),
          H: tensiRaw,
          I: tbVal,
          J: bbVal,
          K: lpVal,
          L: rrVal,
          M: hrVal,
          // Kolom Lab Baru (N=13 s/d X=23)
          N: choVal,
          O: tgVal,
          P: hdlVal,
          Q: ldlVal,
          R: urVal,
          S: creVal,
          T: mauVal,
          U: hba1cVal,
          V: gdpVal,
          W: gdppVal,
          X: gdsVal,
          // Properti nama pasti
          CHO: choVal,
          TG: tgVal,
          HDL: hdlVal,
          LDL: ldlVal,
          UR: urVal,
          CRE: creVal,
          MAU: mauVal,
          HBA1C: hba1cVal,
          GDP: gdpVal,
          GDPP: gdppVal,
          GDS: gdsVal,
          T: formatCellValue(row[19]), // Kolom T (Keluhan Skrining DM)
          U: formatCellValue(row[20]), // Kolom U (Keluhan Pap Smear)
          Y: formatCellValue(row[24]), // Kolom Y (Diagnosa Skrining DM)
          Z: formatCellValue(row[25]), // Kolom Z (Diagnosa Pap Smear)
          AA: anamnesaVal,
          AC: formatCellValue(row[28]),
          AD: formatCellValue(row[29]), // Kolom AD (Keluhan Prolanis)
          AE: formatCellValue(row[30]),
          AF: suhuVal,
          AI: formatCellValue(row[34]), // Kolom AI (Diagnosa Prolanis)
          AJ: formatCellValue(row[35]),
          AO: pelayananNonKapVal,
          AP: pelayananNonKapVal,
          keluhan: keluhanVal,
          jamKunjungan: jamKunjunganVal,
          anamnesa: anamnesaVal,
          diagnosa: diagnosaVal,
          suhu: suhuVal,
          pelayananNonKapitasi: pelayananNonKapVal
        }
      });
    }

    // Untuk Modul 2: Urutkan data berdasarkan nomor antrean asli Kolom A (jika ada), atau nomor baris
    if (isKunjunganMode) {
      patientRecords.sort((a, b) => {
        const numA = parseInt(String(a.antrean || a.noAntrean || "").replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(String(b.antrean || b.noAntrean || "").replace(/\D/g, ""), 10) || 0;
        if (numA > 0 && numB > 0 && numA !== numB) {
          return numA - numB;
        }
        return a.rowNumber - b.rowNumber;
      });
    }

    return createJsonResponse({
      status: "success",
      total: patientRecords.length,
      filteredDate: targetDateStandard || "SEMUA",
      data: patientRecords
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString(),
      data: []
    });
  }
}

/**
 * Helper: Mencari nomor baris aktual berdasarkan rowNumber dan noBpjs
 * Mencegah kesalahan baris jika baris-baris sebelumnya mengalami pergeseran akibat deleteRow
 */
function findActualRowNumber(sheet, rowNumber, noBpjs) {
  let actualRow = Number(rowNumber);
  if (!actualRow || actualRow < 1) actualRow = 9;

  const lastRow = sheet.getLastRow();
  if (lastRow < 9) return actualRow;

  if (noBpjs) {
    const targetNo = String(noBpjs).trim();
    const targetPadded = targetNo.padStart(13, "0");

    // Pada sheet PAPSMEAR, nomor BPJS berada di Kolom E (kolom ke-5). Pada tab lain di Kolom D (kolom ke-4).
    const sName = sheet.getName().toUpperCase();
    const isPapSmear = sName.includes("PAP") || sName.includes("SMEAR");
    const bpjsCol = isPapSmear ? 5 : 4;

    if (actualRow <= lastRow) {
      const currentVal = String(sheet.getRange(actualRow, bpjsCol).getValue()).trim();
      if (currentVal === targetNo || currentVal.padStart(13, "0") === targetPadded) {
        return actualRow;
      }
    }

    const colValues = sheet.getRange(1, bpjsCol, lastRow, 1).getValues();
    for (let r = 8; r < colValues.length; r++) {
      const cellVal = String(colValues[r][0]).trim();
      if (cellVal === targetNo || cellVal.padStart(13, "0") === targetPadded) {
        return r + 1;
      }
    }

    // Fallback: Jika tidak cocok di bpjsCol, coba cek di kolom cadangan (kolom 4 atau 5)
    const fallbackCol = isPapSmear ? 4 : 5;
    const fallbackValues = sheet.getRange(1, fallbackCol, lastRow, 1).getValues();
    for (let r = 8; r < fallbackValues.length; r++) {
      const cellVal = String(fallbackValues[r][0]).trim();
      if (cellVal === targetNo || cellVal.padStart(13, "0") === targetPadded) {
        return r + 1;
      }
    }
  }

  return Math.min(actualRow, lastRow);
}

/**
 * Helper: Mendapatkan atau membuat sheet tujuan migrasi berdasarkan kategori (PROLANIS, SKRINING DM, PAPSMEAR)
 */
function getOrCreateTargetSheet(ss, sourceSheet, category) {
  const currentName = sourceSheet.getName();

  // Ekstrak suffix bulan & tahun dari sheet asal, misal: "PROLANIS SEPTEMBER 2026" -> "SEPTEMBER 2026"
  const suffixMatch = currentName.match(/([A-Za-z]+\s+\d{4})/i);
  let monthYear = "";
  if (suffixMatch) {
    monthYear = suffixMatch[1].trim().toUpperCase();
  } else {
    const months = [
      "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
      "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
    ];
    const now = new Date();
    monthYear = `${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  const expectedName = `${category} ${monthYear}`;

  // 1. Cek nama persis
  let targetSheet = ss.getSheetByName(expectedName);
  if (targetSheet) return targetSheet;

  // 2. Cek sheet yang memuat kategori
  const allSheets = ss.getSheets();
  for (let i = 0; i < allSheets.length; i++) {
    const sName = allSheets[i].getName().toUpperCase();
    if (sName.startsWith(category) || sName.includes(category)) {
      return allSheets[i];
    }
  }

  // 3. Buat sheet baru jika belum ada dan salin header baris 1 s/d 8
  targetSheet = ss.insertSheet(expectedName);
  const totalCols = Math.max(sourceSheet.getLastColumn(), 40);
  const headerRange = sourceSheet.getRange(1, 1, 8, totalCols);
  headerRange.copyTo(targetSheet.getRange(1, 1));
  SpreadsheetApp.flush();

  return targetSheet;
}

/**
 * Menangani permintaan HTTP POST dari Ekstensi Chrome
 * 1. Aksi HASIL_SELESAI: Mewarnai latar belakang baris pasien dengan merah muda/salem (#F4CCCC)
 * 2. Aksi UPDATE_PENDAFTARAN: Update Kolom C & pemindahan baris pasien otomatis ke sheet tujuan (PROLANIS / SKRINING DM / PAPSMEAR)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let hasLock = false;

  try {
    // Tunggu maksimal 15 detik agar antrean proses dari PC/tab lain selesai (mencegah tabrakan data)
    hasLock = lock.tryLock(15000);
    if (!hasLock) {
      Logger.log("Gagal memperoleh ScriptLock dalam 15 detik.");
      return createJsonResponse({
        status: "error",
        message: "Spreadsheet sedang sibuk melayani pembaruan lain. Gagal memperoleh LockService dalam 15 detik."
      });
    }

    let payload = {};

    // Parsing payload JSON dari postData contents
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const ss = getSpreadsheet();
    const action = String(payload.action || payload.status || "").trim().toUpperCase();
    const rowNumber = Number(payload.rowNumber);
    const noBpjs = payload.noBpjs ? String(payload.noBpjs).trim() : "";
    const sheetName = payload.sheetName ? String(payload.sheetName).trim() : (payload.sheetTarget || payload.targetSheet || "");

    const targetSheet = resolveSheet(ss, sheetName, sheetName);

    // -----------------------------------------------------------------------------------
    // AKSI 1: HASIL_SELESAI (Pewarnaan latar belakang baris pasien dengan merah muda/salem #F4CCCC & Update TGL ENTRI)
    // -----------------------------------------------------------------------------------
    if (action === "HASIL_SELESAI") {
      if (!rowNumber || isNaN(rowNumber)) {
        return createJsonResponse({
          status: "error",
          message: "Parameter 'rowNumber' wajib disertakan untuk aksi HASIL_SELESAI."
        });
      }

      const actualRow = findActualRowNumber(targetSheet, rowNumber, noBpjs);
      const totalCols = Math.max(targetSheet.getLastColumn(), 45);
      const targetSheetUpper = targetSheet.getName().toUpperCase();
      const isTargetPapSmear = targetSheetUpper.includes("PAP") || targetSheetUpper.includes("SMEAR");

      // Tentukan nilai tanggal entri sesuai tab:
      // - Saat menerima konfirmasi selesai untuk tab PAPSMEAR:
      //   * Isi kolom TGL ENTRI (Kolom D) dengan nilai patient.tglHasil
      // - Untuk tab PROLANIS / SKRINING:
      //   * Tetap isi kolom TGL ENTRI dengan nilai patient.tglPly
      let tglEntriVal = "";
      const entriCol = isTargetPapSmear ? 4 : 3; // Kolom D (4) untuk PAPSMEAR, Kolom C (3) untuk PROLANIS / SKRINING
      if (isTargetPapSmear) {
        tglEntriVal = payload.tglHasil || payload.effectiveDate || "";
        // Fallback: jika belum ada di payload, baca dari Kolom C (TGL HASIL) pada baris tersebut
        if (!tglEntriVal && actualRow <= targetSheet.getLastRow()) {
          tglEntriVal = formatCellValue(targetSheet.getRange(actualRow, 3).getValue());
        }
        if (!tglEntriVal) {
          tglEntriVal = payload.tglPly || payload.tanggal || "";
        }
      } else {
        tglEntriVal = payload.tglPly || payload.effectiveDate || payload.tanggal || "";
      }

      if (tglEntriVal) {
        targetSheet.getRange(actualRow, entriCol).setValue(tglEntriVal);
      }

      // Berikan warna latar belakang merah muda lembut/salem (#F4CCCC)
      targetSheet.getRange(actualRow, 1, 1, totalCols).setBackground("#F4CCCC");
      SpreadsheetApp.flush();

      return createJsonResponse({
        status: "success",
        action: "HASIL_SELESAI",
        message: `Sukses menandai hasil selesai: Baris ${actualRow} pada sheet '${targetSheet.getName()}' diwarnai #F4CCCC dan TGL ENTRI diisi '${tglEntriVal}'.`,
        rowNumber: actualRow,
        noBpjs: noBpjs,
        sheetName: targetSheet.getName(),
        tglEntri: tglEntriVal
      });
    }

    // -----------------------------------------------------------------------------------
    // AKSI 2: MOVEPATIENTROW / movePatientRow (Pemindahan baris pasien antar sheet)
    // Parameter:
    // - rowIndex / rowNumber: nomor baris asal pada sheet sumber (1-based index)
    // - sourceSheetName: nama sheet asal (default: sheet aktif / 'PROLANIS OKTOBER 2026')
    // - targetSheetName: sheet tujuan ('PAPSMEAR OKTOBER 2026', 'SKRINING DM OKTOBER 2026', atau 'KLAIM MUNDUR')
    // - reason: pesan error / alasan penolakan (opsional)
    // -----------------------------------------------------------------------------------
    if (action === "MOVEPATIENTROW" || action === "MOVE_PATIENT_ROW") {
      const rowIndex = Number(payload.rowIndex || payload.rowNumber);
      if (!rowIndex || isNaN(rowIndex) || rowIndex < 1) {
        return createJsonResponse({
          status: "error",
          message: "Parameter 'rowIndex' tidak valid atau tidak disertakan."
        });
      }

      const sourceSheetName = String(payload.sourceSheetName || payload.fromSheet || payload.sheetName || "PROLANIS OKTOBER 2026").trim();
      const targetSheetName = String(payload.targetSheetName || payload.toSheet || "").trim();
      const reason = String(payload.reason || "").trim();

      if (!targetSheetName) {
        return createJsonResponse({
          status: "error",
          message: "Parameter 'targetSheetName' wajib disertakan untuk aksi movePatientRow."
        });
      }

      const sourceSheet = ss.getSheetByName(sourceSheetName) || resolveSheet(ss, sourceSheetName, sourceSheetName) || ss.getActiveSheet();
      let destSheet = ss.getSheetByName(targetSheetName);

      if (!destSheet) {
        const allSheets = ss.getSheets();
        for (let s of allSheets) {
          if (s.getName().toUpperCase().includes(targetSheetName.toUpperCase())) {
            destSheet = s;
            break;
          }
        }
      }

      if (!destSheet) {
        // Buat sheet baru jika belum ada dan salin header baris 1 s/d 8 dari sourceSheet
        destSheet = ss.insertSheet(targetSheetName);
        const totalColsHeader = Math.max(sourceSheet.getLastColumn(), 45);
        sourceSheet.getRange(1, 1, 8, totalColsHeader).copyTo(destSheet.getRange(1, 1));
      }

      const actualRow = payload.noBpjs ? findActualRowNumber(sourceSheet, rowIndex, payload.noBpjs) : rowIndex;
      if (actualRow > sourceSheet.getLastRow()) {
        return createJsonResponse({
          status: "error",
          message: `Baris ${actualRow} tidak ditemukan pada sheet '${sourceSheet.getName()}'.`
        });
      }

      const totalCols = Math.max(sourceSheet.getLastColumn(), destSheet.getLastColumn(), 45);
      const rowRange = sourceSheet.getRange(actualRow, 1, 1, totalCols);
      const rowValues = rowRange.getValues();
      const rowFormats = rowRange.getNumberFormats();

      const destLastRow = Math.max(destSheet.getLastRow(), 8);
      const newRowNumber = destLastRow + 1;
      const destRange = destSheet.getRange(newRowNumber, 1, 1, totalCols);
      destRange.setValues(rowValues);
      destRange.setNumberFormats(rowFormats);

      // Jika targetSheetName === 'KLAIM MUNDUR' (atau memuat 'KLAIM MUNDUR') dan reason diisi:
      // set nilai kolom TGL ENTRI (Kolom D / index 4) pada baris baru tersebut dengan string reason
      if (targetSheetName.toUpperCase().includes("KLAIM MUNDUR") && reason) {
        destSheet.getRange(newRowNumber, 4).setValue(reason);
      }

      // Jika targetSheetName memuat 'SKRINING' (Skrining DM):
      // Update Kolom C (TGL ENTRI / index 3) dan Kolom A (No. Antrean / index 1) pada sheet tujuan
      if (targetSheetName.toUpperCase().includes("SKRINING")) {
        const tglVal = payload.tanggal || payload.tglEntri || payload.tglPly || "";
        if (tglVal) {
          destSheet.getRange(newRowNumber, 3).setValue(tglVal);
        }
        const antreanVal = payload.noAntrean || payload.noAntrian || payload.antrean || "";
        if (antreanVal) {
          destSheet.getRange(newRowNumber, 1).setValue(antreanVal);
        }
      }

      // Hapus baris asli di sourceSheet menggunakan deleteRow
      sourceSheet.deleteRow(actualRow);
      SpreadsheetApp.flush();

      return createJsonResponse({
        status: "success",
        movedTo: targetSheetName,
        newRowNumber: newRowNumber,
        deletedRow: actualRow,
        reason: reason
      });
    }

    // -----------------------------------------------------------------------------------
    // AKSI 2: UPDATE PENDAFTARAN & PEMINDAHAN SHEET OTOMATIS (PROLANIS / SKRINING DM / PAPSMEAR)
    // -----------------------------------------------------------------------------------
    if (!rowNumber || isNaN(rowNumber) || rowNumber < 1) {
      return createJsonResponse({
        status: "error",
        message: "Parameter 'rowNumber' tidak valid atau tidak disertakan."
      });
    }

    const tanggal = payload.tanggal !== undefined && payload.tanggal !== null ? String(payload.tanggal).trim() : "";
    const jenis = payload.jenis ? String(payload.jenis).trim().toUpperCase() : "";

    // 1. Pastikan pencarian actualRow menggunakan findActualRowNumber
    const actualRow = findActualRowNumber(targetSheet, rowNumber, noBpjs);

    // 2. Tuliskan nilai tanggal ke Kolom C (kolom ke-3)
    if (tanggal) {
      targetSheet.getRange(actualRow, 3).setValue(tanggal);
    }

    // 3. Tuliskan nomor antrean ke Kolom A (kolom ke-1) jika noAntrean ada
    const antreanVal = payload.noAntrean || payload.antrean || payload.noAntrian || "";
    if (antreanVal) {
      targetSheet.getRange(actualRow, 1).setValue(antreanVal);
    }

    // 4. Eksekusi SpreadsheetApp.flush() tepat setelah penulisan nilai agar data langsung tersimpan permanen di Google Sheets
    SpreadsheetApp.flush();

    // Evaluasi Pemindahan Pasien ke Sheet Tujuan Sesuai Jenis Kepesertaan
    let isMoved = false;
    let newSheetName = targetSheet.getName();
    let newRowNumber = actualRow;

    if (jenis) {
      let targetCategory = "";
      // 1. PRIORITAS UTAMA MUTLAK: PROLANIS
      // Jika memuat kata PROLANIS atau PRB, kategori WAJIB PROLANIS (meskipun ada kata DM atau Diabetes)
      if (jenis.includes("PROLANIS") || jenis.includes("PRB")) {
        targetCategory = "PROLANIS";
      } else if (jenis.includes("PAP") || jenis.includes("SMEAR")) {
        targetCategory = "PAPSMEAR";
      } else if (jenis.includes("SKRINING")) {
        // HANYA jika memuat kata SKRINING secara eksplisit dan BUKAN Prolanis
        targetCategory = "SKRINING DM";
      }

      if (targetCategory) {
        const currentUpper = targetSheet.getName().toUpperCase();
        const alreadyMatching =
          (targetCategory === "PROLANIS" && currentUpper.includes("PROLANIS")) ||
          (targetCategory === "SKRINING DM" && currentUpper.includes("SKRINING")) ||
          (targetCategory === "PAPSMEAR" && (currentUpper.includes("PAP") || currentUpper.includes("SMEAR")));

        // Pindahkan HANYA jika sheet asal pasien berbeda dengan jenis yang terdeteksi
        if (!alreadyMatching) {
          const destSheet = getOrCreateTargetSheet(ss, targetSheet, targetCategory);
          if (destSheet && destSheet.getName() !== targetSheet.getName()) {
            const totalCols = Math.max(targetSheet.getLastColumn(), 40);
            const rowRange = targetSheet.getRange(actualRow, 1, 1, totalCols);
            const rowValues = rowRange.getValues();
            const rowFormats = rowRange.getNumberFormats();

            const destLastRow = Math.max(destSheet.getLastRow(), 8);
            newRowNumber = destLastRow + 1;
            const destRange = destSheet.getRange(newRowNumber, 1, 1, totalCols);
            destRange.setValues(rowValues);
            destRange.setNumberFormats(rowFormats);

            // Hapus baris dari sheet asal agar data rapi dan tidak dobel
            targetSheet.deleteRow(actualRow);
            isMoved = true;
            newSheetName = destSheet.getName();
            SpreadsheetApp.flush();
          }
        }
      }
    }

    // 5. Kembalikan response JSON sukses
    return createJsonResponse({
      status: "success",
      action: "UPDATE_PENDAFTARAN",
      rowNumber: actualRow,
      tanggal: tanggal,
      noAntrean: antreanVal,
      message: isMoved
        ? `Sukses update TGL ENTRI dan memindahkan pasien ke '${newSheetName}' (Baris ${newRowNumber}).`
        : `Sukses mengupdate Kolom C (TGL ENTRI) pada baris ${actualRow} dengan nilai "${tanggal}".`,
      moved: isMoved,
      fromSheet: targetSheet.getName(),
      toSheet: newSheetName,
      jenis: jenis
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (err) {
        Logger.log("Error melepaskan LockService: " + err);
      }
    }
  }
}

/**
 * Helper: Memformat nilai sel sheet menjadi string bersih
 */
function formatCellValue(val) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date && !isNaN(val.getTime())) {
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    return `${val.getDate()} ${months[val.getMonth()]} ${val.getFullYear()}`;
  }
  return String(val).trim();
}

/**
 * Helper: Mengembalikan respon berformat JSON standar
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
