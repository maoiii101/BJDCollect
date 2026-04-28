const testAddBtn = document.getElementById("testAddBtn");

testAddBtn.addEventListener("click", async () => {
  await addDollToFirestore({
    name: "測試娃娃",
    company: "測試娃社",
    officialName: "Test Doll",
    price: 0,
    faceupArtist: "",
    faceupType: "",
    faceupPrice: 0,
    imageUrl: ""
  });

  alert("測試資料已新增到 Firestore");
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDC7m1RdpFf0MLTjwQ1xbJ-07ohXgxJ6UU",
  authDomain: "bjdcollect.firebaseapp.com",
  projectId: "bjdcollect",
  storageBucket: "bjdcollect.firebasestorage.app",
  messagingSenderId: "73077257585",
  appId: "1:73077257585:web:479fa36a07b4158b7272d0",
  measurementId: "G-415C8CW94Y"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* ========================================
   Firestore 初始化
   ======================================== */
const db = getFirestore(app);
let currentUser = null;

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");



loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("登入失敗：", error);
    alert("登入失敗：" + error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("登出失敗：", error);
    alert("登出失敗：" + error.message);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    userInfo.textContent = `已登入：${user.displayName || user.email}`;

    console.log("使用者 UID：", user.uid);
  } else {
    currentUser = null;
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userInfo.textContent = "尚未登入";
  }
});

/* ========================================
   Firestore 資料操作函式
   ======================================== */

async function loadDollsFromFirestore() {
  if (!currentUser) return;

  const dollsRef = collection(db, "users", currentUser.uid, "dolls");
  const snapshot = await getDocs(dollsRef);

  const dolls = [];

  snapshot.forEach((docSnap) => {
    dolls.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  console.log("從 Firestore 讀到的娃娃資料：", dolls);

  return dolls;
}

async function addDollToFirestore(dollData) {
  if (!currentUser) {
    alert("請先登入");
    return;
  }

  const dollsRef = collection(db, "users", currentUser.uid, "dolls");

  await addDoc(dollsRef, {
    ...dollData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return await loadDollsFromFirestore();
}

async function updateDollInFirestore(dollId, updatedData) {
  if (!currentUser) {
    alert("請先登入");
    return;
  }

  const dollRef = doc(db, "users", currentUser.uid, "dolls", dollId);

  await updateDoc(dollRef, {
    ...updatedData,
    updatedAt: serverTimestamp()
  });

  return await loadDollsFromFirestore();
}

async function deleteDollFromFirestore(dollId) {
  if (!currentUser) {
    alert("請先登入");
    return;
  }

  await deleteDoc(doc(db, "users", currentUser.uid, "dolls", dollId));

  return await loadDollsFromFirestore();
}
/* ========================================
   BJD 收藏資料庫 — 主程式
   ======================================== */

(function () {
  "use strict";

  /* --------------------------------------------------
     §1  常數與設定
     -------------------------------------------------- */

  const STORAGE_KEY = "bjd_collection";
  const PLACEHOLDER_IMG = "https://placehold.co/400x500?text=No+Image";
  const IDB_NAME = "bjd_image_store";
  const IDB_VERSION = 1;
  const IDB_STORE = "settings";

  const IMAGE_TAG_OPTIONS = [
    "官圖", "素頭圖", "建模圖", "電子妝圖", "完妝圖", "日常照", "外拍","種草圖","購買紀錄",
  ];

  /* --------------------------------------------------
     §1.1  IndexedDB 工具 — 儲存目錄 Handle
     -------------------------------------------------- */

  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(key, value) {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    return new Promise((res) => { tx.oncomplete = res; });
  }

  async function idbGet(key) {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    return new Promise((res) => { req.onsuccess = () => res(req.result ?? null); });
  }

  /* --------------------------------------------------
     §1.2  File System Access — 目錄管理
     -------------------------------------------------- */

  let imageDirHandle = null;
  const imageUrlCache = new Map();

  function fsaSupported() {
    return typeof window.showDirectoryPicker === "function";
  }

  async function pickImageDir() {
    if (!fsaSupported()) {
      alert(
        "目前的環境不支援資料夾存取功能。\n\n" +
        "請使用 Chrome 或 Edge 瀏覽器，並透過本地伺服器開啟此頁面：\n" +
        "1. 開啟終端機，進入此資料夾\n" +
        "2. 執行 npx serve 或 python -m http.server\n" +
        "3. 在瀏覽器開啟 http://localhost 上的網址"
      );
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      imageDirHandle = handle;
      await idbPut("imageDirHandle", handle);
      updateDirStatusUI();
      return handle;
    } catch (err) {
      if (err.name === "AbortError") return null;
      if (err.name === "SecurityError") {
        alert(
          "瀏覽器安全限制：無法存取資料夾。\n\n" +
          "這通常是因為直接以 file:// 開啟網頁。\n" +
          "請改用本地伺服器開啟（見下方說明）：\n\n" +
          "方法一：在此資料夾開啟終端機，執行 npx serve\n" +
          "方法二：執行 python -m http.server 8080\n" +
          "然後在瀏覽器開啟 http://localhost:8080"
        );
      } else {
        alert("無法開啟資料夾選擇器：" + err.message);
      }
      return null;
    }
  }

  async function restoreImageDir() {
    try {
      const handle = await idbGet("imageDirHandle");
      if (!handle) return false;
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        imageDirHandle = handle;
        updateDirStatusUI();
        return true;
      }
    } catch { /* 使用者拒絕或 handle 失效 */ }
    return false;
  }

  function updateDirStatusUI() {
    if (!els.dirName || !els.dirStatus) return;
    if (imageDirHandle) {
      els.dirName.textContent = imageDirHandle.name;
      els.dirStatus.textContent = "已連線";
      els.dirStatus.className = "dir-status-badge connected";
    } else {
      els.dirName.textContent = "尚未設定";
      els.dirStatus.textContent = "未連線";
      els.dirStatus.className = "dir-status-badge";
    }
  }

  /* --------------------------------------------------
     §1.3  圖片檔案讀寫
     -------------------------------------------------- */

  function sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").substring(0, 200);
  }

  function getExtFromDataUrl(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith("data:")) return "jpg";
    const m = dataUrl.match(/^data:image\/(\w+)/);
    if (!m) return "jpg";
    const ext = m[1].toLowerCase();
    return ext === "jpeg" ? "jpg" : ext;
  }

  function dataUrlToBlob(dataUrl) {
    const [header, body] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(body);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function getItemDir(itemId) {
    return imageDirHandle.getDirectoryHandle(sanitizeFileName(itemId), { create: true });
  }

  async function saveImagesToFolder(itemId, images) {
    if (!imageDirHandle) return images;
    const dir = await getItemDir(itemId);
    const saved = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.file) {
        saved.push({ file: img.file, tag: img.tag, cover: img.cover });
        continue;
      }
      if (!img.data) continue;
      const ext = getExtFromDataUrl(img.data);
      const fileName = `img_${String(i + 1).padStart(3, "0")}.${ext}`;
      const fh = await dir.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      if (img.data.startsWith("data:")) {
        await writable.write(dataUrlToBlob(img.data));
      } else {
        try {
          const resp = await fetch(img.data);
          await writable.write(await resp.blob());
        } catch {
          await writable.close();
          continue;
        }
      }
      await writable.close();
      saved.push({ file: fileName, tag: img.tag, cover: img.cover });
    }
    return saved;
  }

  async function loadImageUrl(itemId, fileName) {
    const cacheKey = `${itemId}/${fileName}`;
    if (imageUrlCache.has(cacheKey)) return imageUrlCache.get(cacheKey);
    try {
      const dir = await imageDirHandle.getDirectoryHandle(sanitizeFileName(itemId));
      const fh = await dir.getFileHandle(fileName);
      const file = await fh.getFile();
      const url = URL.createObjectURL(file);
      imageUrlCache.set(cacheKey, url);
      return url;
    } catch {
      return null;
    }
  }

  async function loadImagesForItem(item) {
    const imgs = migrateItemImages(item);
    const result = [];
    for (const img of imgs) {
      if (img.file && imageDirHandle) {
        const url = await loadImageUrl(item.id, img.file);
        result.push({ data: url || PLACEHOLDER_IMG, tag: img.tag, file: img.file, cover: img.cover });
      } else if (img.data) {
        result.push({ data: img.data, tag: img.tag, cover: img.cover });
      }
    }
    return result;
  }

  async function deleteItemFolder(itemId) {
    if (!imageDirHandle) return;
    try {
      await imageDirHandle.removeEntry(sanitizeFileName(itemId), { recursive: true });
    } catch { /* 資料夾不存在則忽略 */ }
  }

  const LABEL_DEFAULTS = {
    officialName: "官方型號",
    faceupArtist: "妝師",
    faceupPrice: "妝面價格",
  };

  const LABEL_BODY = {
    officialName: "素體官方型號",
    faceupArtist: "體妝師",
    faceupPrice: "體妝價格",
  };

  /* --------------------------------------------------
     §2  DOM 參照快取
     -------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  const els = {
    searchInput: $("searchInput"),
    companyFilter: $("companyFilter"),
    statusFilter: $("statusFilter"),
    addBtn: $("addBtn"),
    exportFormat: $("exportFormat"),
    importFormat: $("importFormat"),
    importInput: $("importInput"),
    dirBar: $("dirBar"),
    dirName: $("dirName"),
    dirStatus: $("dirStatus"),
    changeDirBtn: $("changeDirBtn"),
    list: $("list"),
    deleteDialog: $("deleteDialog"),
    deleteMsg: $("deleteMsg"),
    deleteBodyLabel: $("deleteBodyLabel"),
    deleteBodyCheck: $("deleteBodyCheck"),
    deleteCloseBtn: $("deleteCloseBtn"),
    deleteCancelBtn: $("deleteCancelBtn"),
    deleteConfirmBtn: $("deleteConfirmBtn"),
    dialog: $("bjdDialog"),
    dialogTitle: $("dialogTitle"),
    closeBtn: $("closeBtn"),
    cancelBtn: $("cancelBtn"),
    form: $("bjdForm"),
    leadTimeField: $("leadTimeField"),
    uploadZone: $("uploadZone"),
    imageFileInput: $("imageFileInput"),
    imageUrlInput: $("imageUrlInput"),
    addUrlImageBtn: $("addUrlImageBtn"),
    imageGallery: $("imageGallery"),
    // 動態可見性相關
    nameField: $("nameField"),
    bodyMakeupField: $("bodyMakeupField"),
    bodyConfigSection: $("bodyConfigSection"),
    faceupStatusField: $("faceupStatusField"),
    faceupCurrencyField: $("faceupCurrencyField"),
    faceupNotesField: $("faceupNotesField"),
    faceupPaidField: $("faceupPaidField"),
    faceupBalanceField: $("faceupBalanceField"),
    faceupTypeField: $("faceupTypeField"),
    faceupSendDateField: $("faceupSendDateField"),
    faceupDoneDateField: $("faceupDoneDateField"),
    faceupLeadTimeField: $("faceupLeadTimeField"),
    faceupArtistField: $("faceupArtistField"),
    faceupPriceField: $("faceupPriceField"),
    paidAmountField: $("paidAmountField"),
    balanceAmountField: $("balanceAmountField"),
    balanceDateField: $("balanceDateField"),
    existingBodySection: $("existingBodySection"),
    bodySearchInput: $("bodySearchInput"),
    bodyPickerList: $("bodyPickerList"),
    newBodySection: $("newBodySection"),
    bodyFaceupArtistField: $("bodyFaceupArtistField"),
    bodyFaceupTypeField: $("bodyFaceupTypeField"),
    bodyFaceupCurrencyField: $("bodyFaceupCurrencyField"),
    bodyFaceupPriceField: $("bodyFaceupPriceField"),
    bodyFaceupSendDateField: $("bodyFaceupSendDateField"),
    bodyFaceupDoneDateField: $("bodyFaceupDoneDateField"),
    bodyFaceupLeadTimeField: $("bodyFaceupLeadTimeField"),
    // 標籤
    officialNameLabel: $("officialNameLabel"),
    faceupArtistLabel: $("faceupArtistLabel"),
    faceupPriceLabel: $("faceupPriceLabel"),
  };

  const fields = {
    name: $("name"),
    company: $("company"),
    officialName: $("officialName"),
    bjdType: $("bjdType"),
    size: $("size"),
    customSize: $("customSize"),
    skinColor: $("skinColor"),
    status: $("status"),
    customStatus: $("customStatus"),
    currency: $("currency"),
    price: $("price"),
    source: $("source"),
    purchaseDate: $("purchaseDate"),
    arrivalDate: $("arrivalDate"),
    paidAmount: $("paidAmount"),
    balanceAmount: $("balanceAmount"),
    balanceDate: $("balanceDate"),
    faceupType: $("faceupType"),
    customFaceupType: $("customFaceupType"),
    faceupArtist: $("faceupArtist"),
    faceupPrice: $("faceupPrice"),
    faceupStatus: $("faceupStatus"),
    faceupCurrency: $("faceupCurrency"),
    faceupPaid: $("faceupPaid"),
    faceupBalance: $("faceupBalance"),
    faceupNotes: $("faceupNotes"),
    faceupSendDate: $("faceupSendDate"),
    faceupDoneDate: $("faceupDoneDate"),
    faceupLeadTime: $("faceupLeadTime"),
    notes: $("notes"),
    leadTimeDisplay: $("leadTimeDisplay"),
    hasBodyMakeup: $("hasBodyMakeup"),
    bodySource: $("bodySource"),
    selectedBodyId: $("selectedBodyId"),
    bodyCompany: $("bodyCompany"),
    bodyOfficialName: $("bodyOfficialName"),
    bodySize: $("bodySize"),
    bodyCustomSize: $("bodyCustomSize"),
    bodySkinColor: $("bodySkinColor"),
    bodyHasBodyMakeup: $("bodyHasBodyMakeup"),
    bodyFaceupArtist: $("bodyFaceupArtist"),
    bodyFaceupType: $("bodyFaceupType"),
    bodyCustomFaceupType: $("bodyCustomFaceupType"),
    bodyFaceupCurrency: $("bodyFaceupCurrency"),
    bodyFaceupPrice: $("bodyFaceupPrice"),
    bodyFaceupSendDate: $("bodyFaceupSendDate"),
    bodyFaceupDoneDate: $("bodyFaceupDoneDate"),
    bodyFaceupLeadTime: $("bodyFaceupLeadTime"),
  };

  /* --------------------------------------------------
     §3  應用程式狀態
     -------------------------------------------------- */

  let items = [];
  let editingId = null;
  let currentImages = [];  // [{ data, tag }]

  /* --------------------------------------------------
     §4  日期工具
     -------------------------------------------------- */

  function parseFlexibleDate(value) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[.\-]/g, "/")
      .replace(/\u5e74/g, "/")   // 年
      .replace(/\u6708/g, "/")   // 月
      .replace(/\u65e5/g, "")    // 日
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "");

    if (!normalized) return null;

    const match = normalized.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = match[3] ? Number(match[3]) : null;

    if (month < 1 || month > 12) return null;

    const maxDays = new Date(year, month, 0).getDate();
    if (day !== null && (day < 1 || day > maxDays)) return null;

    const pad = (n) => String(n).padStart(2, "0");
    return {
      year,
      month,
      day,
      precision: day === null ? "month" : "day",
      normalized:
        day === null
          ? `${year}/${pad(month)}`
          : `${year}/${pad(month)}/${pad(day)}`,
    };
  }

  function calculateLeadTime(startStr, endStr) {
    const start = parseFlexibleDate(startStr);
    const end = parseFlexibleDate(endStr);
    if (!start || !end) return null;

    const sDay = start.day || 1;
    const eDay = end.day || 1;

    let years = end.year - start.year;
    let months = end.month - start.month;
    let days = eDay - sDay;

    if (days < 0) {
      months--;
      const prevMonth = new Date(end.year, end.month - 1, 0).getDate();
      days += prevMonth;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    if (years < 0 || (years === 0 && months === 0 && days < 0)) return null;

    const parts = [];
    if (years > 0) parts.push(`${years} 年`);
    if (months > 0) parts.push(`${months} 個月`);

    const hasDayPrecision =
      start.precision === "day" && end.precision === "day";
    if (hasDayPrecision && days > 0) {
      parts.push(`${days} 天`);
    }

    const isApprox = !hasDayPrecision;

    if (parts.length === 0) {
      return hasDayPrecision ? "同一天" : "同月份";
    }

    const prefix = isApprox ? "約 " : "";
    return prefix + parts.join("又");
  }

  function refreshLeadTimeDisplay() {
    const result = calculateLeadTime(
      fields.purchaseDate.value,
      fields.arrivalDate.value
    );
    fields.leadTimeDisplay.value = result || "";
  }

  function refreshFaceupLeadTime() {
    const result = calculateLeadTime(
      fields.faceupSendDate.value,
      fields.faceupDoneDate.value
    );
    fields.faceupLeadTime.value = result || "";
  }

  function refreshBodyFaceupLeadTime() {
    const result = calculateLeadTime(
      fields.bodyFaceupSendDate.value,
      fields.bodyFaceupDoneDate.value
    );
    fields.bodyFaceupLeadTime.value = result || "";
  }

  /* --------------------------------------------------
     §5  表單動態可見性
     -------------------------------------------------- */

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("hidden", !visible);
  }

  function resetLabels() {
    els.officialNameLabel.textContent = LABEL_DEFAULTS.officialName;
    els.faceupArtistLabel.textContent = LABEL_DEFAULTS.faceupArtist;
    els.faceupPriceLabel.textContent = LABEL_DEFAULTS.faceupPrice;
  }

  function updateFormVisibility() {
    const type = fields.bjdType.value;
    const bodySource = fields.bodySource.value;
    const hasBodyMakeup = fields.hasBodyMakeup.value === "是";
    const bodyHasBodyMakeup = fields.bodyHasBodyMakeup.value === "是";
    const faceupStatus = fields.faceupStatus.value;

    resetLabels();

    // --- BJD 類型相關 ---
    const visibility = {
      nameField: true,
      bodyMakeupField: false,
      bodyConfigSection: false,
      faceupStatusField: true,
    };

    switch (type) {
      case "單頭":
        break;

      case "素體":
        visibility.nameField = false;
        visibility.bodyMakeupField = true;
        visibility.faceupStatusField = hasBodyMakeup;
        els.officialNameLabel.textContent = LABEL_BODY.officialName;
        if (hasBodyMakeup) {
          els.faceupArtistLabel.textContent = LABEL_BODY.faceupArtist;
          els.faceupPriceLabel.textContent = LABEL_BODY.faceupPrice;
        }
        break;

      case "整娃":
        visibility.bodyConfigSection = true;
        updateBodySubSections(bodySource, bodyHasBodyMakeup);
        break;

      case "小寵":
        break;
    }

    setVisible(els.nameField, visibility.nameField);
    setVisible(els.bodyMakeupField, visibility.bodyMakeupField);
    setVisible(els.bodyConfigSection, visibility.bodyConfigSection);
    setVisible(els.faceupStatusField, visibility.faceupStatusField);

    // --- 妝面狀態相關 ---
    const showFaceup = visibility.faceupStatusField;
    const isApplied = faceupStatus === "已上妝" && showFaceup;
    const isSending = faceupStatus === "送妝中" && showFaceup;

    setVisible(els.faceupArtistField, isApplied || isSending);
    setVisible(els.faceupTypeField, isApplied || isSending);
    setVisible(els.faceupCurrencyField, isApplied || isSending);
    setVisible(els.faceupPriceField, isApplied || isSending);
    setVisible(els.faceupPaidField, isSending);
    setVisible(els.faceupBalanceField, isSending);
    setVisible(els.faceupSendDateField, isApplied || isSending);

    setVisible(els.faceupDoneDateField, isApplied || isSending);
    const doneDateLabel = document.getElementById("faceupDoneDateLabel");
    if (doneDateLabel) {
      doneDateLabel.textContent = isSending ? "預計完妝日期" : "完妝日期";
    }

    setVisible(els.faceupLeadTimeField, isApplied || isSending);
    setVisible(els.faceupNotesField, showFaceup);
  }

  function updateBodySubSections(bodySource, bodyHasBodyMakeup) {
    const isExisting = bodySource === "existing";

    setVisible(els.existingBodySection, isExisting);
    els.newBodySection.classList.toggle("active", !isExisting);

    if (isExisting) {
      renderBodyPicker();
    } else {
      setVisible(els.bodyFaceupArtistField, bodyHasBodyMakeup);
      setVisible(els.bodyFaceupTypeField, bodyHasBodyMakeup);
      setVisible(els.bodyFaceupCurrencyField, bodyHasBodyMakeup);
      setVisible(els.bodyFaceupPriceField, bodyHasBodyMakeup);
      setVisible(els.bodyFaceupSendDateField, bodyHasBodyMakeup);
      setVisible(els.bodyFaceupDoneDateField, bodyHasBodyMakeup);
      setVisible(els.bodyFaceupLeadTimeField, bodyHasBodyMakeup);
    }
  }

  /* --- 素體選擇器 --- */

  function getBodyItems() {
    return items.filter((i) => i.bjdType === "素體");
  }

  function renderBodyPicker(keyword) {
    const all = getBodyItems();

    if (all.length === 0) {
      els.bodyPickerList.innerHTML =
        '<div class="body-picker-empty">尚無素體資料，請先以「素體」類型新增收藏</div>';
      return;
    }

    const kw = (keyword || "").toLowerCase();
    const filtered = kw
      ? all.filter((b) => {
          const haystack = [b.officialName, b.company, b.skinColor, b.size]
            .join(" ")
            .toLowerCase();
          return haystack.includes(kw);
        })
      : all;

    if (filtered.length === 0) {
      els.bodyPickerList.innerHTML =
        '<div class="body-picker-empty">找不到符合的素體</div>';
      return;
    }

    const selectedId = fields.selectedBodyId.value;

    els.bodyPickerList.innerHTML = filtered
      .map((b) => {
        const isSelected = b.id === selectedId;
        const meta = [b.size, b.skinColor, b.company].filter(Boolean).join(" · ");
        return `
        <div class="body-picker-item${isSelected ? " selected" : ""}" data-body-id="${b.id}">
          <div class="body-picker-item-info">
            <div class="body-picker-item-title">${b.officialName || "（未命名素體）"}</div>
            <div class="body-picker-item-meta">${meta || "--"}</div>
          </div>
          <div class="body-picker-item-check">✓</div>
        </div>`;
      })
      .join("");
  }

  /* --------------------------------------------------
     §6  資料持久化 (localStorage → Firestore 遷移中)
     【TODO】以下使用 localStorage，日後需遷移至 Firestore
     -------------------------------------------------- */

  function loadData() {
    // 【TODO】改成：const dolls = await loadDollsFromFirestore();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) items = JSON.parse(saved);

    items.forEach((item) => {
      if (item.purchaseDate)
        item.purchaseDate = item.purchaseDate.replace(/-/g, "/");
      if (item.arrivalDate)
        item.arrivalDate = item.arrivalDate.replace(/-/g, "/");
    });

    refreshCompanyFilter();
    render();
  }

  function saveData() {
    // 【TODO】改成：await addDollToFirestore(data); 或 await updateDollInFirestore(id, data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    refreshCompanyFilter();
    render();
  }

  /* --------------------------------------------------
     §7  篩選器
     -------------------------------------------------- */

  function refreshCompanyFilter() {
    const companies = [...new Set(items.map((i) => i.company))].sort();
    els.companyFilter.innerHTML =
      '<option value="">所有娃社</option>' +
      companies.map((c) => `<option value="${c}">${c}</option>`).join("");
  }

  /* --------------------------------------------------
     §8  渲染卡片列表
     -------------------------------------------------- */

  function matchesSearch(item, keyword) {
    const haystack = [
      item.name,
      item.officialName,
      item.notes,
      item.faceupArtist,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  }

  function buildCardHTML(item) {
    const imgs = migrateItemImages(item);
    const coverImg = imgs.find((img) => img.cover) || imgs[0];
    const isFileRef = coverImg && coverImg.file && !coverImg.data;
    const imgSrc = isFileRef ? PLACEHOLDER_IMG : (coverImg ? coverImg.data : PLACEHOLDER_IMG);
    const tagBadge = coverImg && coverImg.tag
      ? `<span class="card-img-tag">${coverImg.tag}</span>`
      : "";
    const countBadge = imgs.length > 1
      ? `<span class="card-img-count">${imgs.length} 張</span>`
      : "";

    return `
      <article class="card" data-id="${item.id}">
        <div class="card-img-wrapper">
          <img class="card-img" src="${imgSrc}" alt="${item.name}" />
          ${tagBadge}${countBadge}
        </div>
        <div class="card-content">
          <span class="card-type">${item.bjdType} · ${item.size}</span>
          <h2 class="card-title">${item.name}</h2>
          <div class="card-subtitle">${item.company} / ${item.officialName}</div>
          <div class="card-info">
            <div>
              <span class="info-label">購買日期</span>
              <span class="info-value">${item.purchaseDate || "--"}</span>
            </div>
            <div>
              <span class="info-label">到貨日期</span>
              <span class="info-value">${item.arrivalDate || "--"}</span>
            </div>
            <div>
              <span class="info-label">價格</span>
              <span class="info-value">${item.currency} ${item.price.toLocaleString()}</span>
            </div>
            <div>
              <span class="info-label">妝師</span>
              <span class="info-value">${item.faceupArtist || "無"}</span>
            </div>
          </div>
          <span class="card-status status-${item.status}">${item.status}</span>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-flex" data-action="edit">編輯</button>
          <button type="button" class="btn btn-danger" data-action="delete">刪除</button>
        </div>
      </article>`;
  }

  function getLinkedBodyIds() {
    const ids = new Set();
    items.forEach((i) => {
      if (i.selectedBodyId) ids.add(i.selectedBodyId);
    });
    return ids;
  }

  function render() {
    const keyword = els.searchInput.value.toLowerCase();
    const compFilter = els.companyFilter.value;
    const statFilter = els.statusFilter.value;
    const linkedIds = getLinkedBodyIds();

    const filtered = items.filter((i) => {
      if (linkedIds.has(i.id)) return false;
      if (keyword && !matchesSearch(i, keyword)) return false;
      if (compFilter && i.company !== compFilter) return false;
      if (statFilter && i.status !== statFilter) return false;
      return true;
    });

    els.list.innerHTML = filtered.map(buildCardHTML).join("");

    if (imageDirHandle) {
      filtered.forEach((item) => {
        const imgs = migrateItemImages(item);
        const firstImg = imgs[0];
        if (firstImg && firstImg.file) {
          loadImageUrl(item.id, firstImg.file).then((url) => {
            if (!url) return;
            const card = els.list.querySelector(`.card[data-id="${item.id}"] .card-img`);
            if (card) card.src = url;
          });
        }
      });
    }
  }

  /* --------------------------------------------------
     §9  Dialog / 表單操作
     -------------------------------------------------- */

  /* --- 圖片處理 (多圖 + 標籤) --- */

  function addImage(data, tag) {
    currentImages.push({ data, tag: tag || "", cover: currentImages.length === 0 });
    renderImageGallery();
  }

  function normalizeImages(images) {
    const normalized = (images || []).map((img) => ({ ...img, cover: Boolean(img.cover) }));
    const coverIndex = normalized.findIndex((img) => img.cover);
    if (coverIndex > 0) {
      normalized.unshift(normalized.splice(coverIndex, 1)[0]);
    }
    if (!normalized.some((img) => img.cover) && normalized.length > 0) {
      normalized[0].cover = true;
    }
    return normalized;
  }

  function setCoverImage(index) {
    currentImages = currentImages.map((img, idx) => ({ ...img, cover: idx === index }));
    currentImages = normalizeImages(currentImages);
    renderImageGallery();
  }

  function removeImage(index) {
    currentImages.splice(index, 1);
    if (!currentImages.some((img) => img.cover) && currentImages.length > 0) {
      currentImages[0].cover = true;
    }
    renderImageGallery();
  }

  function updateImageTag(index, tag) {
    if (currentImages[index]) currentImages[index].tag = tag;
  }

  function buildTagSelect(currentTag, index) {
    const isCustom =
      currentTag && !IMAGE_TAG_OPTIONS.includes(currentTag);
    const options = IMAGE_TAG_OPTIONS.map(
      (t) => `<option${t === currentTag ? " selected" : ""}>${t}</option>`
    ).join("");

    return `
      <select data-idx="${index}" data-role="tag-select">
        <option value="">選擇標籤…</option>
        ${options}
        <option value="__custom"${isCustom ? " selected" : ""}>其他（自訂）</option>
      </select>
      <input type="text"
        data-idx="${index}" data-role="tag-custom"
        class="${isCustom ? "" : "hidden"}"
        placeholder="輸入自訂標籤"
        value="${isCustom ? currentTag : ""}" />`;
  }

  function renderImageGallery() {
    els.imageGallery.innerHTML = currentImages
      .map(
        (img, i) => {
          const isCover = Boolean(img.cover);
          return `
      <div class="gallery-item${isCover ? " gallery-item-selected" : ""}" data-idx="${i}">
        <img class="gallery-item-img" src="${img.data}" alt="" />
        <button type="button" class="gallery-item-remove" data-role="remove" title="移除">✕</button>
        <button type="button" class="gallery-item-cover" data-role="cover" title="設為卡片封面">${isCover ? "封面" : "設為封面"}</button>
        <div class="gallery-item-footer">
          ${buildTagSelect(img.tag, i)}
        </div>
      </div>`;
        }
      )
      .join("");
  }

  function handleImageFiles(fileList) {
    Array.from(fileList).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => addImage(e.target.result, "");
      reader.readAsDataURL(file);
    });
  }

  function handleAddUrlImage() {
    const url = els.imageUrlInput.value.trim();
    if (!url) return;
    addImage(url, "");
    els.imageUrlInput.value = "";
  }

  /* --- Dialog 開啟 / 編輯 --- */

  function migrateItemImages(item) {
    if (item.images) {
      const images = item.images.map((img) => ({ ...img, cover: Boolean(img.cover) }));
      if (typeof item.coverIndex === "number" && images[item.coverIndex]) {
        images.forEach((img, idx) => (img.cover = idx === item.coverIndex));
      }
      return normalizeImages(images);
    }
    if (item.imageData) return normalizeImages([{ data: item.imageData, tag: "", cover: true }]);
    if (item.imageInput) return normalizeImages([{ data: item.imageInput, tag: "", cover: true }]);
    return [];
  }

  function openAddDialog() {
    editingId = null;
    els.dialogTitle.textContent = "新增收藏";
    els.form.reset();
    currentImages = [];
    renderImageGallery();
    els.bodySearchInput.value = "";
    fields.selectedBodyId.value = "";
    fields.customStatus.classList.add("hidden");
    fields.customFaceupType.classList.add("hidden");
    setVisible(els.paidAmountField, false);
    setVisible(els.balanceAmountField, false);
    setVisible(els.balanceDateField, false);
    updateFormVisibility();
    els.dialog.showModal();
    refreshLeadTimeDisplay();
    refreshFaceupLeadTime();
  }

  function openEditDialog(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    editingId = id;
    els.dialogTitle.textContent = "編輯收藏";

    Object.keys(fields).forEach((key) => {
      if (!fields[key]) return;
      fields[key].value =
        item[key] || (fields[key].type === "number" ? 0 : "");
    });

    const standardSizes = [
      "三分", "三插四", "三插六", "四分", "四插六", "六分", "小六", "八分",
    ];
    if (item.size && !standardSizes.includes(item.size)) {
      fields.size.value = "custom";
      fields.customSize.classList.remove("hidden");
      fields.customSize.value = item.size;
    } else {
      fields.customSize.classList.add("hidden");
    }

    const standardStatuses = [
      "已到貨", "工期中", "待補尾款", "待送妝", "化妝中", "待出售", "已售出",
    ];
    if (item.status && !standardStatuses.includes(item.status)) {
      fields.status.value = "__custom";
      fields.customStatus.classList.remove("hidden");
      fields.customStatus.value = item.status;
    } else {
      fields.customStatus.classList.add("hidden");
    }

    const isBalance = item.status === "待補尾款";
    setVisible(els.paidAmountField, isBalance);
    setVisible(els.balanceAmountField, isBalance);
    setVisible(els.balanceDateField, isBalance);
    if (isBalance) {
      fields.paidAmount.value = item.paidAmount || 0;
      fields.balanceAmount.value = item.balanceAmount || 0;
      fields.balanceDate.value = item.balanceDate || "";
    }

    const standardFaceupTypes = ["自由妝", "指定妝", "COS妝"];
    if (item.faceupType && !standardFaceupTypes.includes(item.faceupType)) {
      fields.faceupType.value = "__custom";
      fields.customFaceupType.classList.remove("hidden");
      fields.customFaceupType.value = item.faceupType;
    } else {
      fields.customFaceupType.classList.add("hidden");
    }

    if (imageDirHandle) {
      loadImagesForItem(item).then((loaded) => {
        currentImages = normalizeImages(loaded);
        renderImageGallery();
      });
    } else {
      currentImages = normalizeImages(migrateItemImages(item));
      renderImageGallery();
    }

    els.bodySearchInput.value = "";
    fields.selectedBodyId.value = item.selectedBodyId || "";

    updateFormVisibility();
    refreshLeadTimeDisplay();
    refreshFaceupLeadTime();
    els.dialog.showModal();
  }

  let pendingDeleteId = null;

  function deleteItem(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    pendingDeleteId = id;
    els.deleteMsg.textContent = `確定要刪除「${item.name || item.officialName || "此項目"}」嗎？`;

    const hasLinkedBody = item.bjdType === "整娃" && item.selectedBodyId;
    els.deleteBodyLabel.classList.toggle("hidden", !hasLinkedBody);
    els.deleteBodyCheck.checked = false;

    els.deleteDialog.showModal();
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const item = items.find((i) => i.id === pendingDeleteId);
    const deleteBody = item && item.bjdType === "整娃" && item.selectedBodyId && els.deleteBodyCheck.checked;

    deleteItemFolder(pendingDeleteId);
    if (deleteBody) {
      deleteItemFolder(item.selectedBodyId);
      items = items.filter((i) => i.id !== pendingDeleteId && i.id !== item.selectedBodyId);
    } else {
      items = items.filter((i) => i.id !== pendingDeleteId);
    }

    pendingDeleteId = null;
    els.deleteDialog.close();
    saveData();
  }

  function cancelDelete() {
    pendingDeleteId = null;
    els.deleteDialog.close();
  }

  function collectFormData() {
    return {
      id: editingId || Date.now().toString(),
      name: fields.name.value,
      company: fields.company.value,
      officialName: fields.officialName.value,
      bjdType: fields.bjdType.value,
      size:
        fields.size.value === "custom"
          ? fields.customSize.value
          : fields.size.value,
      skinColor: fields.skinColor.value,
      status:
        fields.status.value === "__custom"
          ? fields.customStatus.value
          : fields.status.value,
      paidAmount: parseFloat(fields.paidAmount.value) || 0,
      balanceAmount: parseFloat(fields.balanceAmount.value) || 0,
      balanceDate: fields.balanceDate.value,
      currency: fields.currency.value,
      price: parseFloat(fields.price.value) || 0,
      source: fields.source.value,
      purchaseDate: fields.purchaseDate.value,
      arrivalDate: fields.arrivalDate.value,
      leadTime: fields.leadTimeDisplay.value,
      faceupStatus: fields.faceupStatus.value,
      faceupType:
        fields.faceupType.value === "__custom"
          ? fields.customFaceupType.value
          : fields.faceupType.value,
      faceupNotes: fields.faceupNotes.value,
      faceupSendDate: fields.faceupSendDate.value,
      faceupDoneDate: fields.faceupDoneDate.value,
      faceupLeadTime: fields.faceupLeadTime.value,
      faceupArtist: fields.faceupArtist.value,
      faceupCurrency: fields.faceupCurrency.value,
      faceupPrice: parseFloat(fields.faceupPrice.value) || 0,
      faceupPaid: parseFloat(fields.faceupPaid.value) || 0,
      faceupBalance: parseFloat(fields.faceupBalance.value) || 0,
      notes: fields.notes.value,
      images: normalizeImages(currentImages.slice()),
      hasBodyMakeup: fields.hasBodyMakeup.value,
      bodySource: fields.bodySource.value,
      selectedBodyId: fields.selectedBodyId.value,
      bodyCompany: fields.bodyCompany.value,
      bodyOfficialName: fields.bodyOfficialName.value,
      bodySize:
        fields.bodySize.value === "custom"
          ? fields.bodyCustomSize.value
          : fields.bodySize.value,
      bodySkinColor: fields.bodySkinColor.value,
      bodyHasBodyMakeup: fields.bodyHasBodyMakeup.value,
      bodyFaceupArtist: fields.bodyFaceupArtist.value,
      bodyFaceupType:
        fields.bodyFaceupType.value === "__custom"
          ? fields.bodyCustomFaceupType.value
          : fields.bodyFaceupType.value,
      bodyFaceupCurrency: fields.bodyFaceupCurrency.value,
      bodyFaceupPrice: parseFloat(fields.bodyFaceupPrice.value) || 0,
      bodyFaceupSendDate: fields.bodyFaceupSendDate.value,
      bodyFaceupDoneDate: fields.bodyFaceupDoneDate.value,
      bodyFaceupLeadTime: fields.bodyFaceupLeadTime.value,
    };
  }

  function buildBodyItemFromForm(parentId) {
    return {
      id: Date.now().toString() + "_body",
      bjdType: "素體",
      name: "",
      company: fields.bodyCompany.value,
      officialName: fields.bodyOfficialName.value,
      size:
        fields.bodySize.value === "custom"
          ? fields.bodyCustomSize.value
          : fields.bodySize.value,
      skinColor: fields.bodySkinColor.value,
      status: "已到貨",
      currency: "TWD",
      price: 0,
      source: "",
      purchaseDate: "",
      arrivalDate: "",
      leadTime: "",
      hasBodyMakeup: fields.bodyHasBodyMakeup.value,
      faceupArtist: fields.bodyFaceupArtist.value,
      faceupType:
        fields.bodyFaceupType.value === "__custom"
          ? fields.bodyCustomFaceupType.value
          : fields.bodyFaceupType.value,
      faceupCurrency: fields.bodyFaceupCurrency.value,
      faceupPrice: parseFloat(fields.bodyFaceupPrice.value) || 0,
      faceupSendDate: fields.bodyFaceupSendDate.value,
      faceupDoneDate: fields.bodyFaceupDoneDate.value,
      faceupLeadTime: fields.bodyFaceupLeadTime.value,
      notes: "",
      images: [],
      linkedParentId: parentId,
    };
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    let data = collectFormData();
    currentImages = normalizeImages(currentImages);

    if (imageDirHandle) {
      try {
        data.images = await saveImagesToFolder(data.id, currentImages);
      } catch (err) {
        console.error("圖片儲存失敗", err);
        alert("圖片儲存失敗，請確認資料夾權限。圖片將以內嵌方式儲存。");
      }
    }

    if (editingId) {
      const idx = items.findIndex((i) => i.id === editingId);
      items[idx] = data;
    } else {
      items.push(data);
    }

    if (
      data.bjdType === "整娃" &&
      data.bodySource === "new" &&
      fields.bodyOfficialName.value.trim()
    ) {
      const bodyItem = buildBodyItemFromForm(data.id);
      const existingIdx = items.findIndex(
        (i) => i.linkedParentId === data.id && i.bjdType === "素體"
      );
      if (existingIdx >= 0) {
        bodyItem.id = items[existingIdx].id;
        items[existingIdx] = bodyItem;
      } else {
        items.push(bodyItem);
      }
      data.selectedBodyId = bodyItem.id;
      const mainIdx = items.findIndex((i) => i.id === data.id);
      if (mainIdx >= 0) items[mainIdx] = data;
    }

    saveData();
    els.dialog.close();
  }

  /* --------------------------------------------------
     §10  匯出 / 匯入
     -------------------------------------------------- */

  function datestamp() {
    return new Date().toISOString().split("T")[0].replace(/-/g, "");
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `bjd_collection_${datestamp()}.json`);
  }

  const CSV_COLUMNS = [
    { key: "name",             label: "名稱" },
    { key: "company",          label: "娃社" },
    { key: "officialName",     label: "官方名稱" },
    { key: "bjdType",          label: "類型" },
    { key: "size",             label: "尺寸" },
    { key: "skinColor",        label: "膚色" },
    { key: "status",           label: "狀態" },
    { key: "currency",         label: "幣別" },
    { key: "price",            label: "價格" },
    { key: "paidAmount",       label: "已付金額" },
    { key: "balanceAmount",    label: "尾款金額" },
    { key: "balanceDate",      label: "預計補款日期" },
    { key: "source",           label: "購買來源" },
    { key: "purchaseDate",     label: "購買日期" },
    { key: "arrivalDate",      label: "到貨日期" },
    { key: "leadTime",         label: "工期" },
    { key: "hasBodyMakeup",    label: "體妝" },
    { key: "faceupStatus",     label: "妝面狀態" },
    { key: "faceupArtist",     label: "妝師" },
    { key: "faceupType",       label: "妝面類型" },
    { key: "faceupCurrency",   label: "妝面幣別" },
    { key: "faceupPrice",      label: "妝面價格" },
    { key: "faceupPaid",       label: "妝面已付金額" },
    { key: "faceupBalance",    label: "妝面尾款金額" },
    { key: "faceupSendDate",   label: "送妝日期" },
    { key: "faceupDoneDate",   label: "完妝日期" },
    { key: "faceupLeadTime",   label: "妝期" },
    { key: "faceupNotes",      label: "妝造備註" },
    { key: "bodySource",       label: "素體來源" },
    { key: "bodyCompany",      label: "素體娃社" },
    { key: "bodyOfficialName", label: "素體官方名稱" },
    { key: "bodySize",         label: "素體尺寸" },
    { key: "bodySkinColor",    label: "素體膚色" },
    { key: "notes",            label: "備註" },
  ];

  const NUMERIC_KEYS = new Set([
    "price", "paidAmount", "balanceAmount",
    "faceupPrice", "faceupPaid", "faceupBalance",
  ]);

  function exportCSV() {
    function csvEscape(val) {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const header = CSV_COLUMNS.map((c) => csvEscape(c.label)).join(",");
    const rows = items.map((item) =>
      CSV_COLUMNS.map((c) => csvEscape(item[c.key])).join(",")
    );

    const bom = "\uFEFF";
    const blob = new Blob([bom + header + "\n" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(blob, `bjd_collection_${datestamp()}.csv`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport(format) {
    if (!format) return;
    if (format === "json") exportJSON();
    else if (format === "csv") exportCSV();
  }

  let pendingImportFormat = "json";

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let imported;
        if (pendingImportFormat === "csv") {
          imported = parseCSV(e.target.result);
        } else {
          imported = JSON.parse(e.target.result);
        }
        if (Array.isArray(imported) && imported.length > 0) {
          items = imported;
          saveData();
          alert(`匯入成功！共 ${imported.length} 筆資料`);
        } else {
          alert("檔案內無有效資料");
        }
      } catch {
        alert("檔案格式錯誤，請確認檔案內容");
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function parseCSV(text) {
    const cleaned = text.replace(/^\uFEFF/, "");
    const rows = parseCSVRows(cleaned);
    if (rows.length < 2) return [];

    const headerRow = rows[0];
    const labelToKey = {};
    CSV_COLUMNS.forEach((c) => { labelToKey[c.label] = c.key; });

    const colMap = headerRow.map((h) => labelToKey[h.trim()] || null);

    const result = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      if (cells.every((c) => c.trim() === "")) continue;

      const obj = {
        id: Date.now().toString() + "_" + r,
        images: [],
      };

      colMap.forEach((key, i) => {
        if (!key) return;
        let val = (cells[i] || "").trim();
        if (NUMERIC_KEYS.has(key)) {
          obj[key] = parseFloat(val) || 0;
        } else {
          obj[key] = val;
        }
      });

      result.push(obj);
    }
    return result;
  }

  function parseCSVRows(text) {
    const rows = [];
    let current = [];
    let cell = "";
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          cell += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ",") {
          current.push(cell);
          cell = "";
          i++;
        } else if (ch === "\r" || ch === "\n") {
          current.push(cell);
          cell = "";
          rows.push(current);
          current = [];
          if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
          i++;
        } else {
          cell += ch;
          i++;
        }
      }
    }
    if (cell || current.length > 0) {
      current.push(cell);
      rows.push(current);
    }
    return rows;
  }

  /* --------------------------------------------------
     §11  事件繫結
     -------------------------------------------------- */

  function bindEvents() {
    // 工具列
    els.addBtn.addEventListener("click", openAddDialog);
    els.exportFormat.addEventListener("change", function () {
      handleExport(this.value);
      this.selectedIndex = 0;
    });
    els.importFormat.addEventListener("change", function () {
      if (!this.value) return;
      pendingImportFormat = this.value;
      els.importInput.accept = this.value === "csv" ? ".csv" : ".json";
      els.importInput.click();
      this.selectedIndex = 0;
    });
    els.importInput.addEventListener("change", (e) => {
      importData(e.target.files[0]);
      e.target.value = "";
    });
    els.changeDirBtn.addEventListener("click", async () => {
      const handle = await pickImageDir();
      if (handle) render();
    });
    els.searchInput.addEventListener("input", render);
    els.companyFilter.addEventListener("change", render);
    els.statusFilter.addEventListener("change", render);

    // Dialog
    els.closeBtn.addEventListener("click", () => els.dialog.close());
    els.cancelBtn.addEventListener("click", () => els.dialog.close());

    // 刪除確認 Dialog
    els.deleteConfirmBtn.addEventListener("click", confirmDelete);
    els.deleteCancelBtn.addEventListener("click", cancelDelete);
    els.deleteCloseBtn.addEventListener("click", cancelDelete);

    // 表單提交
    els.form.addEventListener("submit", handleFormSubmit);

    // 日期失焦自動格式化（所有日期欄位統一處理）
    [fields.purchaseDate, fields.arrivalDate, fields.balanceDate].forEach(
      (field) => {
        field.addEventListener("blur", () => {
          const res = parseFlexibleDate(field.value);
          if (res) field.value = res.normalized;
          refreshLeadTimeDisplay();
        });
      }
    );

    [fields.faceupSendDate, fields.faceupDoneDate].forEach((field) => {
      field.addEventListener("blur", () => {
        const res = parseFlexibleDate(field.value);
        if (res) field.value = res.normalized;
        refreshFaceupLeadTime();
      });
    });

    // 圖片上傳 — 點擊觸發檔案選擇
    els.uploadZone.addEventListener("click", () => {
      els.imageFileInput.click();
    });

    els.imageFileInput.addEventListener("change", (e) => {
      handleImageFiles(e.target.files);
      els.imageFileInput.value = "";
    });

    // 圖片上傳 — 拖放
    els.uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.uploadZone.classList.add("drag-over");
    });
    els.uploadZone.addEventListener("dragleave", () => {
      els.uploadZone.classList.remove("drag-over");
    });
    els.uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.uploadZone.classList.remove("drag-over");
      handleImageFiles(e.dataTransfer.files);
    });

    // URL 加入按鈕
    els.addUrlImageBtn.addEventListener("click", handleAddUrlImage);

    // 圖片庫事件委派（移除 / 設為封面 / 標籤選擇 / 自訂標籤輸入）
    els.imageGallery.addEventListener("click", (e) => {
      const coverBtn = e.target.closest("[data-role='cover']");
      if (coverBtn) {
        const item = coverBtn.closest(".gallery-item");
        setCoverImage(Number(item.dataset.idx));
        return;
      }

      const removeBtn = e.target.closest("[data-role='remove']");
      if (removeBtn) {
        const item = removeBtn.closest(".gallery-item");
        removeImage(Number(item.dataset.idx));
      }
    });

    els.imageGallery.addEventListener("change", (e) => {
      const el = e.target;
      const idx = Number(el.dataset.idx);

      if (el.dataset.role === "tag-select") {
        const customInput = els.imageGallery.querySelector(
          `input[data-idx="${idx}"][data-role="tag-custom"]`
        );
        if (el.value === "__custom") {
          customInput.classList.remove("hidden");
          customInput.focus();
          updateImageTag(idx, customInput.value);
        } else {
          customInput.classList.add("hidden");
          updateImageTag(idx, el.value);
        }
      }
    });

    els.imageGallery.addEventListener("input", (e) => {
      if (e.target.dataset.role === "tag-custom") {
        updateImageTag(Number(e.target.dataset.idx), e.target.value);
      }
    });

    // 自訂妝面類型切換
    fields.faceupType.addEventListener("change", () => {
      const isCustom = fields.faceupType.value === "__custom";
      fields.customFaceupType.classList.toggle("hidden", !isCustom);
      if (isCustom) fields.customFaceupType.focus();
    });

    // 自訂尺寸切換
    fields.size.addEventListener("change", () => {
      fields.customSize.classList.toggle(
        "hidden",
        fields.size.value !== "custom"
      );
    });

    // 狀態切換 — 自訂 & 待補尾款欄位
    fields.status.addEventListener("change", () => {
      const val = fields.status.value;
      fields.customStatus.classList.toggle("hidden", val !== "__custom");
      if (val === "__custom") fields.customStatus.focus();
      const isBalance = val === "待補尾款";
      setVisible(els.paidAmountField, isBalance);
      setVisible(els.balanceAmountField, isBalance);
      setVisible(els.balanceDateField, isBalance);
    });

    // 素體尺寸自訂切換
    fields.bodySize.addEventListener("change", () => {
      fields.bodyCustomSize.classList.toggle(
        "hidden",
        fields.bodySize.value !== "custom"
      );
    });

    // 體妝類型自訂切換
    fields.bodyFaceupType.addEventListener("change", () => {
      const isCustom = fields.bodyFaceupType.value === "__custom";
      fields.bodyCustomFaceupType.classList.toggle("hidden", !isCustom);
      if (isCustom) fields.bodyCustomFaceupType.focus();
    });

    // 體妝日期格式化 & 妝期計算
    [fields.bodyFaceupSendDate, fields.bodyFaceupDoneDate].forEach((field) => {
      field.addEventListener("blur", () => {
        const res = parseFlexibleDate(field.value);
        if (res) field.value = res.normalized;
        refreshBodyFaceupLeadTime();
      });
    });

    // 素體選擇器 — 搜尋
    els.bodySearchInput.addEventListener("input", () => {
      renderBodyPicker(els.bodySearchInput.value);
    });

    // 素體選擇器 — 點選（事件委派）
    els.bodyPickerList.addEventListener("click", (e) => {
      const item = e.target.closest(".body-picker-item");
      if (!item) return;
      const id = item.dataset.bodyId;
      // 再次點擊取消選取
      fields.selectedBodyId.value =
        fields.selectedBodyId.value === id ? "" : id;
      renderBodyPicker(els.bodySearchInput.value);
    });

    // 動態表單可見性
    fields.bjdType.addEventListener("change", updateFormVisibility);
    fields.faceupStatus.addEventListener("change", updateFormVisibility);
    fields.hasBodyMakeup.addEventListener("change", updateFormVisibility);
    fields.bodySource.addEventListener("change", updateFormVisibility);
    fields.bodyHasBodyMakeup.addEventListener("change", updateFormVisibility);

    // 卡片操作 — 事件委派
    els.list.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const card = btn.closest(".card");
      if (!card) return;
      const id = card.dataset.id;

      switch (btn.dataset.action) {
        case "edit":
          openEditDialog(id);
          break;
        case "delete":
          deleteItem(id);
          break;
      }
    });
  }

  /* --------------------------------------------------
     §12  初始化
     -------------------------------------------------- */

  async function init() {
    bindEvents();
    loadData();

    if (fsaSupported()) {
      const restored = await restoreImageDir();
      if (restored) render();
    }
  }

  init();
})();
