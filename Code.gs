/**
 * =========================================================================================
 * SISTEM OTOMASI GOOGLE SHEETS KE PCARE BPJS (TWO-WAY SYNC)
 * File: Code.gs (Google Apps Script)
 * Target Spreadsheet Salinan (Testing Sheet): 1IUQqUAyz3Omonb4y7Lh1QqnrkGIJGSwF5xTPIxi_A4s
 * =========================================================================================
 * Petunjuk Deploy:
 * 1. Buka Google Sheets Salinan / Testing Anda.
 * 2. Klik Extensions (Ekstensi) > Apps Script.
 * 3. Hapus seluruh kode lama dan paste seluruh isi file ini ke file `Code.gs`.
 * 4. Klik ikon Disket (Save).
 * 5. PENTING: Klik tombol "Deploy" > "Manage deployments" > Edit (ikon pensil).
 * 6. Pada dropdown "Version", pilih "New version" (Wajib buat versi baru agar update aktif!).
 * 7. Klik tombol "Deploy" lalu salin "Web App URL" ke content.js.
 * =========================================================================================
 */

// Spreadsheet ID Salinan (Testing Sheet)
const SPREADSHEET_ID = "1IUQqUAyz3Omonb4y7Lh1QqnrkGIJGSwF5xTPIxi_A4s";

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
 * Menangani permintaan HTTP GET dari Ekstensi Chrome
 * - Modul 1 (Pendaftaran): Mengambil pasien yang Kolom C (TGL ENTRI) masih KOSONG
 * - Modul 2 (Kunjungan / Input Hasil):
 *     1. Kolom C (TGL ENTRI) HARUS ADA ISINYA (sudah terdaftar)
 *     2. Memiliki minimal 1 data hasil lab non-kosong (CHO, TG, GDP, HBA1C, dll)
 *     3. Background baris BELUM BERWARNA MERAH/SALEM (#F4CCCC / #E6B8AF)
 */
function doGet(e) {
  try {
    const ss = getSpreadsheet();
    const sheet = (e && e.parameter && e.parameter.sheet)
      ? (ss.getSheetByName(e.parameter.sheet) || ss.getActiveSheet())
      : ss.getActiveSheet();

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

    // Ambil Header pada Baris 7 (Mencakup minimal 45 kolom hingga Kolom AO)
    const totalCols = Math.max(sheet.getLastColumn(), 45);
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
      const matchDDMM = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (matchDDMM) {
        const d = matchDDMM[1].padStart(2, "0");
        const m = matchDDMM[2].padStart(2, "0");
        const y = matchDDMM[3];
        return `${d}-${m}-${y}`;
      }
      const matchISO = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
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

    // Helper pencarian dinamis berdasarkan header baris 7 dengan fallback indeks pasti
    function getColIdx(headerNames, defaultIdx) {
      for (let c = 0; c < headers.length; c++) {
        const text = headers[c] ? String(headers[c]).trim().toUpperCase() : "";
        for (let name of headerNames) {
          if (text === name || text.startsWith(name)) {
            return c;
          }
        }
      }
      return defaultIdx;
    }

    const idxTglEntri = getColIdx(["TGL ENTRI", "TANGGAL ENTRI", "TGL ENTRY", "TANGGAL ENTRY", "TGL_ENTRI"], 2); // Kolom C
    const idxBpjs = getColIdx(["NO BPJS", "NO. BPJS", "NO KARTU"], 3);    // Kolom D
    const idxNama = getColIdx(["NAMA PESERTA", "NAMA"], 4);                // Kolom E
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

    // Data Kunjungan & Klinis
    const idxKeluhan = getColIdx(["KELUHAN", "SKRINING"], 24);             // Kolom Y / AC
    const idxJam = getColIdx(["JAM KUNJUNGAN", "JAM"], 25);                // Kolom Z / AD
    const idxAnamnesa = getColIdx(["ANAMNESA", "ANAMNESIS"], 26);          // Kolom AA / AE
    const idxDiagnosa = getColIdx(["DIAGNOSA", "KODE DIAGNOSA", "ICD10"], 30); // Kolom AE / AI
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
        // Default: Utamakan tanggal hari ini jika ada baris yang bertanggal hari ini
        const todayStandard = toStandardDDMMYYYY(new Date());
        let hasToday = false;
        for (let i = dataValues.length - 1; i >= 0; i--) {
          const cVal = dataValues[i][idxTglEntri];
          if (cVal && toStandardDDMMYYYY(cVal) === todayStandard) {
            hasToday = true;
            break;
          }
        }

        if (hasToday) {
          targetDateStandard = todayStandard;
        } else {
          // Fallback: Cari tanggal pendaftaran terbaru dari baris paling bawah yang memiliki TGL ENTRI
          for (let i = dataValues.length - 1; i >= 0; i--) {
            const cVal = dataValues[i][idxTglEntri];
            if (cVal && formatCellValue(cVal) !== "") {
              const std = toStandardDDMMYYYY(cVal);
              if (std) {
                targetDateStandard = std;
                break;
              }
            }
          }
        }
      }
    }

    const patientRecords = [];

    for (let i = 0; i < dataValues.length; i++) {
      const row = dataValues[i];
      const currentRowNumber = i + 9;
      const rowBg = String(backgrounds[i][0] || "").trim().toUpperCase();

      const tglEntriRaw = row[idxTglEntri];
      const tglEntriClean = formatCellValue(tglEntriRaw);

      // -------------------------------------------------------------
      // 1. FILTER BERDASARKAN MODE OPERASI
      // -------------------------------------------------------------

      if (!isKunjunganMode) {
        // MODUL 1 (PENDAFTARAN):
        // HANYA ambil baris yang Kolom C (TGL ENTRI) masih KOSONG
        if (tglEntriClean !== "") {
          continue;
        }
      } else {
        // MODUL 2 (ENTRI KUNJUNGAN & INPUT HASIL LAB):
        // a. Kolom C (TGL ENTRI) HARUS ADA ISINYA (hanya pasien yang sudah terdaftar)
        if (tglEntriClean === "") {
          continue;
        }

        // b. Filter Tanggal: Hanya proses baris yang tanggal entri-nya cocok dengan target tanggal
        if (targetDateStandard) {
          const rowDateStandard = toStandardDDMMYYYY(tglEntriRaw);
          if (rowDateStandard !== targetDateStandard) {
            continue;
          }
        }

        // c. Background baris BELUM BERWARNA MERAH/SALEM (#F4CCCC / #E6B8AF)
        const isAlreadyCompleted =
          isRedOrSalem(backgrounds[i][0]) ||
          isRedOrSalem(backgrounds[i][1]) ||
          isRedOrSalem(backgrounds[i][2]) ||
          isRedOrSalem(backgrounds[i][3]);

        if (isAlreadyCompleted) {
          continue; // Pasien sudah selesai diinput hasil labnya
        }
      }

      // 2. Ambil No BPJS dan bersihkan spasi
      const noBpjsRaw = row[idxBpjs];
      const noBpjsClean = noBpjsRaw !== null && noBpjsRaw !== undefined ? String(noBpjsRaw).trim() : "";

      // Rule: Abaikan/skip baris jika kolom NO BPJS kosong
      if (!noBpjsClean) {
        continue;
      }

      // Pastikan standar 13 digit nomor kartu BPJS (tambahkan leading zeros jika hilang)
      const noBpjs = noBpjsClean.padStart(13, "0");

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

      // c. Filter Khusus Modul 2: Memiliki minimal 1 data lab valid non-kosong
      const hasAnyLab = Boolean(
        choVal || tgVal || hdlVal || ldlVal || urVal || creVal || mauVal ||
        hba1cVal || gdpVal || gdppVal || gdsVal
      );

      if (isKunjunganMode && !hasAnyLab) {
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

      // 6. Data Kunjungan & Klinis (Kolom AC, AD, AE, AI, AJ)
      const keluhanVal = formatCellValue(row[idxKeluhan]);
      const jamKunjunganVal = formatCellValue(row[idxJam]) || "07:00";
      const anamnesaVal = formatCellValue(row[idxAnamnesa]);
      const diagnosaVal = formatCellValue(row[idxDiagnosa]);
      const suhuVal = formatCellValue(row[idxSuhu]) || "36.0";

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

      // Susun record data terstruktur untuk dikirim ke ekstensi Chrome
      patientRecords.push({
        rowNumber: currentRowNumber,
        sheetName: sheet.getName(),
        tglEntri: tglEntriClean,
        noBpjs: noBpjs,
        nama: formatCellValue(row[idxNama]),
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
          C: tglEntriClean,
          D: noBpjs,
          E: formatCellValue(row[4]),
          F: formatCellValue(row[5]),
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
          Y: keluhanVal,
          Z: jamKunjunganVal,
          AA: anamnesaVal,
          AE: diagnosaVal,
          AF: suhuVal,
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

    // Untuk Modul 2: Urutkan baris sesuai urutan pendaftaran antrean di spreadsheet (Row terkecil ke terbesar, 1, 2, 3...)
    if (isKunjunganMode) {
      patientRecords.sort((a, b) => a.rowNumber - b.rowNumber);
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

    if (actualRow <= lastRow) {
      const currentVal = String(sheet.getRange(actualRow, 4).getValue()).trim();
      if (currentVal === targetNo || currentVal.padStart(13, "0") === targetPadded) {
        return actualRow;
      }
    }

    const dValues = sheet.getRange(1, 4, lastRow, 1).getValues();
    for (let r = 8; r < dValues.length; r++) {
      const cellVal = String(dValues[r][0]).trim();
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
    const sheetName = payload.sheetName ? String(payload.sheetName).trim() : "";

    const targetSheet = sheetName ? (ss.getSheetByName(sheetName) || ss.getActiveSheet()) : ss.getActiveSheet();

    // -----------------------------------------------------------------------------------
    // AKSI 1: HASIL_SELESAI (Pewarnaan latar belakang baris pasien dengan merah muda/salem #F4CCCC)
    // -----------------------------------------------------------------------------------
    if (action === "HASIL_SELESAI") {
      if (!rowNumber || isNaN(rowNumber)) {
        return createJsonResponse({
          status: "error",
          message: "Parameter 'rowNumber' wajib disertakan untuk aksi HASIL_SELESAI."
        });
      }

      const actualRow = findActualRowNumber(targetSheet, rowNumber, noBpjs);
      const totalCols = Math.max(targetSheet.getLastColumn(), 40);

      // Berikan warna latar belakang merah muda lembut/salem (#F4CCCC)
      targetSheet.getRange(actualRow, 1, 1, totalCols).setBackground("#F4CCCC");
      SpreadsheetApp.flush();

      return createJsonResponse({
        status: "success",
        action: "HASIL_SELESAI",
        message: `Sukses menandai hasil selesai: Baris ${actualRow} pada sheet '${targetSheet.getName()}' diwarnai #F4CCCC.`,
        rowNumber: actualRow,
        noBpjs: noBpjs,
        sheetName: targetSheet.getName()
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

    const actualRow = findActualRowNumber(targetSheet, rowNumber, noBpjs);

    // Tulis nilai tanggal di Kolom C (kolom ke-3)
    if (tanggal) {
      targetSheet.getRange(actualRow, 3).setValue(tanggal);
    }

    // Evaluasi Pemindahan Pasien ke Sheet Tujuan Sesuai Jenis Kepesertaan
    let isMoved = false;
    let newSheetName = targetSheet.getName();
    let newRowNumber = actualRow;

    if (jenis) {
      let targetCategory = "";
      if (jenis.includes("PAP") || jenis.includes("SMEAR")) {
        targetCategory = "PAPSMEAR";
      } else if (jenis.includes("SKRINING") || jenis.includes("DM")) {
        targetCategory = "SKRINING DM";
      } else if (jenis.includes("PROLANIS")) {
        targetCategory = "PROLANIS";
      }

      if (targetCategory) {
        const currentUpper = targetSheet.getName().toUpperCase();
        const alreadyMatching =
          (targetCategory === "PROLANIS" && currentUpper.includes("PROLANIS")) ||
          (targetCategory === "SKRINING DM" && (currentUpper.includes("SKRINING") || currentUpper.includes("DM"))) ||
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
          }
        }
      }
    }

    SpreadsheetApp.flush();

    return createJsonResponse({
      status: "success",
      message: isMoved
        ? `Sukses update TGL ENTRI dan memindahkan pasien ke '${newSheetName}' (Baris ${newRowNumber}).`
        : `Sukses mengupdate Kolom C (TGL ENTRI) pada baris ${actualRow} dengan nilai "${tanggal}".`,
      rowNumber: newRowNumber,
      tanggal: tanggal,
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
