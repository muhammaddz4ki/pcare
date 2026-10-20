/**
 * =========================================================================================
 * File: popup.js
 * Bertugas mengirim pesan / trigger ke content.js pada tab aktif untuk Modul 1 & Modul 2.
 * =========================================================================================
 */

document.addEventListener("DOMContentLoaded", async () => {
  const btnPendaftaran = document.getElementById("btnPendaftaran");
  const btnInputHasil = document.getElementById("btnInputHasil");
  const btnStart = document.getElementById("btnStart");
  const selectSheetTarget = document.getElementById("selectSheetTarget");
  const hintModul1 = document.getElementById("hintModul1");
  const statusBox = document.getElementById("statusBox");
  const pageDot = document.getElementById("pageDot");
  const pageText = document.getElementById("pageText");

  const filterTanggal = document.getElementById("filterTanggal");
  const btnHariIni = document.getElementById("btnHariIni");

  function updateSheetTargetUI() {
    const val = selectSheetTarget ? selectSheetTarget.value : "PROLANIS";
    if (hintModul1) {
      if (val === "PAPSMEAR") {
        hintModul1.style.display = "block";
        hintModul1.textContent = "(Untuk Pap Smear, lewati Modul 1 dan langsung jalankan Modul 2)";
      } else if (val === "SKRINING") {
        hintModul1.style.display = "block";
        hintModul1.textContent = "(Pasien Skrining DM yang sudah didaftarkan & dipindahkan langsung diproses di Modul 2)";
      } else {
        hintModul1.style.display = "none";
      }
    }
  }

  const safeStorage = {
    get: (key, cb) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], cb);
      } else {
        try {
          const val = localStorage.getItem(key);
          cb({ [key]: val });
        } catch (e) { cb({}); }
      }
    },
    set: (obj) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj);
      } else {
        try {
          Object.keys(obj).forEach(k => localStorage.setItem(k, obj[k]));
        } catch (e) {}
      }
    }
  };

  if (filterTanggal) {
    safeStorage.get("savedFilterTanggal", (result) => {
      if (result && result.savedFilterTanggal) {
        filterTanggal.value = result.savedFilterTanggal;
      }
    });

    filterTanggal.addEventListener("input", () => {
      safeStorage.set({ savedFilterTanggal: filterTanggal.value });
    });
  }

  if (btnHariIni && filterTanggal) {
    btnHariIni.addEventListener("click", () => {
      const today = new Date();
      const d = String(today.getDate()).padStart(2, "0");
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const y = today.getFullYear();
      const todayStr = `${d}-${m}-${y}`;
      filterTanggal.value = todayStr;
      safeStorage.set({ savedFilterTanggal: todayStr });
    });
  }

  if (selectSheetTarget) {
    safeStorage.get("selectedSheetTarget", (result) => {
      if (result && result.selectedSheetTarget) {
        selectSheetTarget.value = result.selectedSheetTarget;
      }
      updateSheetTargetUI();
    });

    selectSheetTarget.addEventListener("change", () => {
      safeStorage.set({ selectedSheetTarget: selectSheetTarget.value });
      updateSheetTargetUI();
    });
  }

  function showStatus(message, isError = false) {
    if (!statusBox) return;
    statusBox.style.display = "block";
    statusBox.style.background = isError ? "#fee2e2" : "#f1f5f9";
    statusBox.style.color = isError ? "#991b1b" : "#334155";
    statusBox.style.borderLeftColor = isError ? "#dc2626" : "#0284c7";
    statusBox.textContent = message;
  }

  function showNotification(message, type = "info") {
    const isError = type === "error" || type === "warning";
    showStatus(message, isError);
  }

  function setButtonsDisabled(disabled) {
    if (btnPendaftaran) btnPendaftaran.disabled = disabled;
    if (btnInputHasil) btnInputHasil.disabled = disabled;
    if (btnStart) btnStart.disabled = disabled;
  }

  // 1. Deteksi URL Halaman Aktif saat popup dibuka
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      const url = activeTab.url;
      if (url.includes("EntriKunjunganDokkel")) {
        if (pageDot) pageDot.classList.add("active");
        if (pageText) {
          pageText.textContent = "Halaman: Entri Kunjungan & Hasil Lab";
          pageText.style.color = "#059669";
          pageText.style.fontWeight = "600";
        }
      } else if (url.includes("pendaftaran") || url.includes("Pendaftaran")) {
        if (pageDot) pageDot.classList.add("active");
        if (pageText) {
          pageText.textContent = "Halaman: Pendaftaran Pasien";
          pageText.style.color = "#0284c7";
          pageText.style.fontWeight = "600";
        }
      } else if (url.includes("bpjs-kesehatan.go.id")) {
        if (pageDot) pageDot.classList.add("active");
        if (pageText) pageText.textContent = "Portal PCare Terdeteksi";
      } else {
        if (pageText) {
          pageText.textContent = "Bukan Halaman PCare BPJS";
          pageText.style.color = "#ef4444";
        }
      }
    }
  } catch (e) {
    console.warn("Gagal mendeteksi URL aktif:", e);
  }



  const limitData = document.getElementById("limitData");
  const customLimitInput = document.getElementById("customLimitInput");
  const limitHint = document.getElementById("limitHint");

  function getSelectedLimit() {
    if (!limitData) return 0;
    const val = limitData.value;
    if (val === "all") return 0; // 0 berarti semua data (tanpa limit)
    if (val === "custom") {
      const customVal = customLimitInput ? parseInt(customLimitInput.value, 10) : 0;
      return (customVal && customVal > 0) ? customVal : 0;
    }
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  }

  function getLimitLabel(limit) {
    if (!limit || limit <= 0) return "Semua Data";
    return `${limit} Data (Tes)`;
  }

  if (limitData) {
    limitData.addEventListener("change", () => {
      if (limitData.value === "custom") {
        if (customLimitInput) {
          customLimitInput.style.display = "inline-block";
          customLimitInput.focus();
        }
        if (limitHint) limitHint.textContent = "Ketik jumlah data yang ingin diproses (misal: 2, 5, 15).";
      } else {
        if (customLimitInput) customLimitInput.style.display = "none";
        const lim = getSelectedLimit();
        if (limitHint) {
          limitHint.textContent = lim > 0
            ? `Hanya akan memproses maksimal ${lim} pasien pertama dari Google Sheets.`
            : "Memproses semua data yang tersedia di Google Sheets.";
        }
      }
    });
  }

  if (customLimitInput) {
    customLimitInput.addEventListener("input", () => {
      const val = parseInt(customLimitInput.value, 10);
      if (limitHint) {
        limitHint.textContent = (val && val > 0)
          ? `Hanya akan memproses maksimal ${val} pasien pertama dari Google Sheets.`
          : "Ketik angka jumlah data yang valid.";
      }
    });
  }

  // Helper untuk mengirim pesan ke tab aktif
  async function sendAction(actionName, defaultProgressMsg, extraData = {}) {
    setButtonsDisabled(true);
    showStatus(defaultProgressMsg);

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab || !activeTab.id) {
        showNotification("Tidak menemukan tab aktif!", "warning");
        setButtonsDisabled(false);
        return;
      }

      const payload = { action: actionName, ...extraData };
      chrome.tabs.sendMessage(activeTab.id, payload, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Koneksi gagal:", chrome.runtime.lastError.message);
          // Tampilkan notifikasi visual di popup jika tab belum di-refresh
          showNotification("Silakan refresh (F5) tab PCare terlebih dahulu!", "warning");
          setButtonsDisabled(false);
          return;
        }

        if (response && response.success) {
          showStatus(response.message || "Proses otomasi telah dimulai!");
        } else {
          showNotification(response ? response.message : "Terjadi kesalahan saat memulai.", "error");
          setButtonsDisabled(false);
        }
      });
    } catch (err) {
      showNotification("Error: " + err.message, "error");
      setButtonsDisabled(false);
    }
  }

  // 2. Event Listener: Modul 1 (Pendaftaran Pasien)
  if (btnPendaftaran) {
    btnPendaftaran.addEventListener("click", () => {
      const limit = getSelectedLimit();
      const limitText = getLimitLabel(limit);
      const sheetTargetVal = selectSheetTarget ? selectSheetTarget.value : "PROLANIS";
      const tglFilterVal = filterTanggal ? String(filterTanggal.value || "").trim() : "";

      const msg = `Memulai Pendaftaran Pasien (${sheetTargetVal}${tglFilterVal ? `, ${tglFilterVal}` : ""}, ${limitText})...`;
      sendAction("START_PENDAFTARAN", msg, { limit: limit, sheetTarget: sheetTargetVal, tgl: tglFilterVal });
    });
  }

  // 3. Event Listener: Modul 2 (Entri Kunjungan & Hasil Lab)
  if (btnInputHasil) {
    btnInputHasil.addEventListener("click", () => {
      const selectedRadio = document.querySelector('input[name="searchMode"]:checked');
      const searchMode = (selectedRadio && selectedRadio.value === "antrian") ? "antrian" : "kartu";
      const modeLabel = searchMode === "antrian" ? "No. Antrian" : "No. Kartu BPJS";
      const limit = getSelectedLimit();
      const limitText = getLimitLabel(limit);
      const sheetTargetVal = selectSheetTarget ? selectSheetTarget.value : "PROLANIS";
      const tglFilterVal = filterTanggal ? String(filterTanggal.value || "").trim() : "";

      const msg = `Memulai Entri Kunjungan (${sheetTargetVal}${tglFilterVal ? `, ${tglFilterVal}` : ""}, ${modeLabel}, ${limitText})...`;
      sendAction("START_INPUT_HASIL", msg, { searchMode: searchMode, limit: limit, sheetTarget: sheetTargetVal, tgl: tglFilterVal });
    });
  }

  // 4. Fallback Event Listener jika ada pemanggil START_AUTO_FILL
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      const selectedRadio = document.querySelector('input[name="searchMode"]:checked');
      const searchMode = (selectedRadio && selectedRadio.value === "antrian") ? "antrian" : "kartu";
      const limit = getSelectedLimit();
      const sheetTargetVal = selectSheetTarget ? selectSheetTarget.value : "PROLANIS";
      const tglFilterVal = filterTanggal ? String(filterTanggal.value || "").trim() : "";
      sendAction("START_AUTO_FILL", "Menghubungi halaman aktif...", { searchMode: searchMode, limit: limit, sheetTarget: sheetTargetVal, tgl: tglFilterVal });
    });
  }
});
