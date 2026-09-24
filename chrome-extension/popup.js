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
  const statusBox = document.getElementById("statusBox");
  const pageDot = document.getElementById("pageDot");
  const pageText = document.getElementById("pageText");

  function showStatus(message, isError = false) {
    statusBox.style.display = "block";
    statusBox.style.background = isError ? "#fee2e2" : "#f1f5f9";
    statusBox.style.color = isError ? "#991b1b" : "#334155";
    statusBox.style.borderLeftColor = isError ? "#dc2626" : "#0284c7";
    statusBox.textContent = message;
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
        pageDot.classList.add("active");
        pageText.textContent = "Halaman: Entri Kunjungan & Hasil Lab";
        pageText.style.color = "#059669";
        pageText.style.fontWeight = "600";
      } else if (url.includes("pendaftaran") || url.includes("Pendaftaran")) {
        pageDot.classList.add("active");
        pageText.textContent = "Halaman: Pendaftaran Pasien";
        pageText.style.color = "#0284c7";
        pageText.style.fontWeight = "600";
      } else if (url.includes("bpjs-kesehatan.go.id")) {
        pageDot.classList.add("active");
        pageText.textContent = "Portal PCare Terdeteksi";
      } else {
        pageText.textContent = "Bukan Halaman PCare BPJS";
        pageText.style.color = "#ef4444";
      }
    }
  } catch (e) {
    console.warn("Gagal mendeteksi URL aktif:", e);
  }

  const filterTanggal = document.getElementById("filterTanggal");
  const btnHariIni = document.getElementById("btnHariIni");

  // Helper tanggal format Bahasa Indonesia (misal: "14 September 2026")
  function getTodayFormattedIndo() {
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

  // Set default nilai input filter tanggal ke tanggal hari ini
  if (filterTanggal && !filterTanggal.value) {
    filterTanggal.value = getTodayFormattedIndo();
  }

  if (btnHariIni) {
    btnHariIni.addEventListener("click", () => {
      if (filterTanggal) {
        filterTanggal.value = getTodayFormattedIndo();
        showStatus(`Filter tanggal disetel ke hari ini (${filterTanggal.value}).`);
      }
    });
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
        showStatus("Tidak menemukan tab aktif.", true);
        setButtonsDisabled(false);
        return;
      }

      chrome.tabs.sendMessage(
        activeTab.id,
        { action: actionName, ...extraData },
        (response) => {
          if (chrome.runtime.lastError) {
            showStatus(
              "Gagal: Pastikan Anda membuka portal PCare BPJS dan sudah me-refresh halaman (F5) setelah ekstensi diperbarui.",
              true
            );
            setButtonsDisabled(false);
            return;
          }

          if (response && response.success) {
            showStatus(response.message || "Proses otomasi telah dimulai!");
          } else {
            showStatus(response ? response.message : "Terjadi kesalahan saat memulai.", true);
            setButtonsDisabled(false);
          }
        }
      );
    } catch (err) {
      showStatus("Error: " + err.message, true);
      setButtonsDisabled(false);
    }
  }

  // 2. Event Listener: Modul 1 (Pendaftaran Pasien)
  if (btnPendaftaran) {
    btnPendaftaran.addEventListener("click", () => {
      const tglFilter = filterTanggal ? filterTanggal.value.trim() : "";
      const limit = getSelectedLimit();
      const limitText = getLimitLabel(limit);

      const msg = `Memulai Pendaftaran Pasien (${limitText}${tglFilter ? `, Tgl: ${tglFilter}` : ""})...`;
      sendAction("START_PENDAFTARAN", msg, { tgl: tglFilter, limit: limit });
    });
  }

  // 3. Event Listener: Modul 2 (Entri Kunjungan & Hasil Lab)
  if (btnInputHasil) {
    btnInputHasil.addEventListener("click", () => {
      const tglFilter = filterTanggal ? filterTanggal.value.trim() : "";
      const selectedRadio = document.querySelector('input[name="searchMode"]:checked');
      const searchMode = selectedRadio ? selectedRadio.value : "kartu";
      const modeLabel = searchMode === "antrian" ? "No. Antrian" : "No. Kartu BPJS";
      const limit = getSelectedLimit();
      const limitText = getLimitLabel(limit);

      const msg = `Memulai Entri Kunjungan (${modeLabel}, ${limitText}${tglFilter ? `, Filter: ${tglFilter}` : ""})...`;
      sendAction("START_INPUT_HASIL", msg, { tgl: tglFilter, searchMode: searchMode, limit: limit });
    });
  }

  // 4. Fallback Event Listener jika ada pemanggil START_AUTO_FILL
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      const tglFilter = filterTanggal ? filterTanggal.value.trim() : "";
      const selectedRadio = document.querySelector('input[name="searchMode"]:checked');
      const searchMode = selectedRadio ? selectedRadio.value : "kartu";
      const limit = getSelectedLimit();
      sendAction("START_AUTO_FILL", "Menghubungi halaman aktif...", { tgl: tglFilter, searchMode: searchMode, limit: limit });
    });
  }
});
