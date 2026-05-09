const API_BASE_URL = window.location.origin;

let allFilesData = [];
let allCategoriesData = [];
let currentCategory = "all";
let currentActiveCategoryPath = [];
let currentExpandedCategoryPath = [];
let hasInitializedCategoryBrowser = false;
let adminPassword = "";
let isLoggedIn = false;
let pendingMoveFile = null;
let searchResultsData = [];
let currentSearchPage = 1;
const SEARCH_PAGE_SIZE = 8;
let activeDownloadAbortController = null;
let categoryOrderDraft = [];
let categoryOrderMotion = null;
const MAX_CATEGORY_DEPTH = 5;

document.addEventListener("DOMContentLoaded", () => {
  const els = {
    loginSection: document.getElementById("loginSection"),
    loginForm: document.getElementById("loginForm"),
    adminSection: document.getElementById("adminSection"),
    loginBtn: document.getElementById("loginBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    adminPasswordLogin: document.getElementById("adminPasswordLogin"),
    loginStatus: document.getElementById("loginStatus"),
    uploadBtn: document.getElementById("uploadBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    fileInput: document.getElementById("fileInput"),
    categorySelect: document.getElementById("categorySelect"),
    subCategorySelect: document.getElementById("subCategorySelect"),
    subCategoryInput: document.getElementById("subCategoryInput"),
    externalCategorySelect: document.getElementById("externalCategorySelect"),
    externalSubCategorySelect: document.getElementById("externalSubCategorySelect"),
    externalSubCategoryInput: document.getElementById("externalSubCategoryInput"),
    externalTitleInput: document.getElementById("externalTitleInput"),
    externalUrlInput: document.getElementById("externalUrlInput"),
    externalExtractionMode: document.getElementById("externalExtractionMode"),
    externalExtractionInput: document.getElementById("externalExtractionInput"),
    addExternalLinkBtn: document.getElementById("addExternalLinkBtn"),
    externalLinkStatus: document.getElementById("externalLinkStatus"),
    uploadStatus: document.getElementById("uploadStatus"),
    fileList: document.getElementById("fileList"),
    categoryTabs: document.getElementById("categoryTabs"),
    manageCategoriesBtn: document.getElementById("manageCategoriesBtn"),
    categoryModal: document.getElementById("categoryModal"),
    closeModal: document.getElementById("closeModal"),
    addCategoryBtn: document.getElementById("addCategoryBtn"),
    addSubCategoryBtn: document.getElementById("addSubCategoryBtn"),
    renameCategoryBtn: document.getElementById("renameCategoryBtn"),
    deleteCategoryBtn: document.getElementById("deleteCategoryBtn"),
    parentCategorySelect: document.getElementById("parentCategorySelect"),
    renameCategorySelect: document.getElementById("renameCategorySelect"),
    deleteCategorySelect: document.getElementById("deleteCategorySelect"),
    newCategoryName: document.getElementById("newCategoryName"),
    newSubCategoryName: document.getElementById("newSubCategoryName"),
    renameCategoryInput: document.getElementById("renameCategoryInput"),
    moveFileModal: document.getElementById("moveFileModal"),
    closeMoveModal: document.getElementById("closeMoveModal"),
    cancelMoveBtn: document.getElementById("cancelMoveBtn"),
    confirmMoveBtn: document.getElementById("confirmMoveBtn"),
    moveFileName: document.getElementById("moveFileName"),
    moveCategorySelect: document.getElementById("moveCategorySelect"),
    moveSubCategorySelect: document.getElementById("moveSubCategorySelect"),
    moveStatus: document.getElementById("moveStatus"),
    searchInput: document.getElementById("searchInput"),
    searchBtn: document.getElementById("searchBtn"),
    searchStatus: document.getElementById("searchStatus"),
    searchModal: document.getElementById("searchModal"),
    closeSearchModal: document.getElementById("closeSearchModal"),
    closeSearchFooterBtn: document.getElementById("closeSearchFooterBtn"),
    searchKeywordLabel: document.getElementById("searchKeywordLabel"),
    searchResultMeta: document.getElementById("searchResultMeta"),
    searchResultList: document.getElementById("searchResultList"),
    searchPagination: document.getElementById("searchPagination"),
    searchPrevBtn: document.getElementById("searchPrevBtn"),
    searchNextBtn: document.getElementById("searchNextBtn"),
    searchPageInfo: document.getElementById("searchPageInfo"),
    downloadStatusToast: document.getElementById("downloadStatusToast"),
    downloadStatusTitle: document.getElementById("downloadStatusTitle"),
    downloadStatusMessage: document.getElementById("downloadStatusMessage"),
    downloadProgressBar: document.getElementById("downloadProgressBar"),
    categoryOrderList: document.getElementById("categoryOrderList"),
    categoryOrderStatus: document.getElementById("categoryOrderStatus"),
    saveCategoryOrderBtn: document.getElementById("saveCategoryOrderBtn")
  };

  initializeThemeToggle();
  bindEvents(els);
  bindEnhancedCategoryEvents(els);
  initializePage(els);
});

async function initializePage(els) {
  await Promise.all([loadCategories(els), loadFileList(els)]);
}


// Official cleaned script: deduplicated from script.runtime.js, keeping last effective definitions.

function initializeThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) {
    return;
  }

  const textNode = toggle.querySelector(".theme-toggle-text");
  const applyTheme = (theme) => {
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    document.body.dataset.theme = normalizedTheme;
    toggle.setAttribute("aria-pressed", String(normalizedTheme === "dark"));
    toggle.setAttribute("aria-label", normalizedTheme === "dark" ? "切换日间模式" : "切换夜间模式");
    if (textNode) {
      textNode.textContent = normalizedTheme === "dark" ? "夜间" : "日间";
    }
  };

  const savedTheme = localStorage.getItem("jianxiaoyun-theme");
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  toggle.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem("jianxiaoyun-theme", nextTheme);
  });
}


function sortFilesByUploadTimeDesc(files) {
  files.sort((a, b) => {
    const left = Date.parse(a?.uploadTime || "") || 0;
    const right = Date.parse(b?.uploadTime || "") || 0;
    return right - left;
  });
}


function bindEvents(els) {
  const handleLogin = async () => {
    const password = els.adminPasswordLogin.value.trim();
    if (!password) {
      showLoginStatus(els, "请输入管理员密码。", "error");
      return;
    }
    await verifyPassword(els, password);
  };

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  els.loginBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  els.adminPasswordLogin.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.loginBtn.click();
    }
  });

  els.logoutBtn.addEventListener("click", () => {
    isLoggedIn = false;
    adminPassword = "";
    els.adminPasswordLogin.value = "";
    els.loginSection.style.display = "block";
    els.adminSection.style.display = "none";
    showLoginStatus(els, "", "");
    showUploadStatus(els, "", "");
    renderFileList(els);
  });

  els.manageCategoriesBtn.addEventListener("click", () => {
    if (!assertAdmin()) {
      return;
    }
    els.categoryModal.classList.add("show");
    renderManagementSelects(els);
    initializeCategoryOrderDraft();
    renderCategoryOrderList(els);
  });

  els.closeModal.addEventListener("click", () => {
    els.categoryModal.classList.remove("show");
  });

  window.addEventListener("click", (event) => {
    if (event.target === els.categoryModal) {
      els.categoryModal.classList.remove("show");
    }
    if (event.target === els.moveFileModal) {
      closeMoveModal(els);
    }
    if (event.target === els.searchModal) {
      closeSearchModal(els);
    }
  });

  els.refreshBtn.addEventListener("click", async () => {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = "刷新...";
    await Promise.all([loadCategories(els), loadFileList(els)]);
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "刷新列表";
  });

  els.categorySelect.addEventListener("change", () => {
    updateSubCategoryList(els, els.categorySelect.value);
  });

  if (els.externalCategorySelect) {
    els.externalCategorySelect.addEventListener("change", () => {
      updateExternalSubCategoryList(els, els.externalCategorySelect.value);
    });
  }

  if (els.externalExtractionMode) {
    els.externalExtractionMode.addEventListener("change", () => {
      const isCustom = els.externalExtractionMode.value === "custom";
      if (els.externalExtractionInput) {
        els.externalExtractionInput.disabled = !isCustom;
        if (!isCustom) {
          els.externalExtractionInput.value = "";
        }
      }
    });
  }

  if (els.moveCategorySelect) {
    els.moveCategorySelect.addEventListener("change", () => {
      renderMoveSubCategoryOptions(els, els.moveCategorySelect.value, "");
    });
  }

  if (els.closeMoveModal) {
    els.closeMoveModal.addEventListener("click", () => {
      closeMoveModal(els);
    });
  }

  if (els.cancelMoveBtn) {
    els.cancelMoveBtn.addEventListener("click", () => {
      closeMoveModal(els);
    });
  }

  if (els.confirmMoveBtn) {
    els.confirmMoveBtn.addEventListener("click", async () => {
      await submitMoveFile(els);
    });
  }

  if (els.searchBtn) {
    els.searchBtn.addEventListener("click", () => {
      executeSearch(els);
    });
  }

  if (els.searchInput) {
    els.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        executeSearch(els);
      }
    });
  }

  if (els.closeSearchModal) {
    els.closeSearchModal.addEventListener("click", () => {
      closeSearchModal(els);
    });
  }

  if (els.closeSearchFooterBtn) {
    els.closeSearchFooterBtn.addEventListener("click", () => {
      closeSearchModal(els);
    });
  }

  if (els.searchPrevBtn) {
    els.searchPrevBtn.addEventListener("click", () => {
      if (currentSearchPage > 1) {
        currentSearchPage -= 1;
        renderSearchResults(els);
      }
    });
  }

  if (els.searchNextBtn) {
    els.searchNextBtn.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(searchResultsData.length / SEARCH_PAGE_SIZE));
      if (currentSearchPage < totalPages) {
        currentSearchPage += 1;
        renderSearchResults(els);
      }
    });
  }

  if (els.saveCategoryOrderBtn) {
    els.saveCategoryOrderBtn.addEventListener("click", async () => {
      await saveCategoryOrder(els);
    });
  }

  if (els.addExternalLinkBtn) {
    els.addExternalLinkBtn.addEventListener("click", async () => {
      await addExternalLinkFile(els);
    });
  }

  els.addCategoryBtn.addEventListener("click", async () => {
    if (!assertAdmin()) return;

    const name = els.newCategoryName.value.trim();
    if (!name) {
      alert("请输入大栏目名称。");
      return;
    }

    await manageCategoryRequest(els, {
      method: "POST",
      body: {
        password: adminPassword,
        action: "addCategory",
        categoryName: name
      },
      onSuccess: (result) => {
        els.newCategoryName.value = "";
        upsertCategory(result.category?.name || name, []);
        syncCategoryViews(els, {
          selectedCategory: result.category?.name || name,
          activeCategory: result.category?.name || name
        });
      }
    });
  });

  els.addSubCategoryBtn.addEventListener("click", async () => {
    if (!assertAdmin()) return;

    const categoryName = els.parentCategorySelect.value;
    const subCategoryName = els.newSubCategoryName.value.trim();
    if (!categoryName) {
      alert("请先选择父栏目。");
      return;
    }
    if (!subCategoryName) {
      alert("请输入小栏目名称。");
      return;
    }

    await manageCategoryRequest(els, {
      method: "POST",
      body: {
        password: adminPassword,
        action: "addSubCategory",
        categoryName,
        subCategoryName
      },
      onSuccess: () => {
        els.newSubCategoryName.value = "";
        upsertCategory(categoryName, [subCategoryName]);
        syncCategoryViews(els, {
          selectedCategory: categoryName,
          activeCategory: categoryName
        });
      }
    });
  });

  els.renameCategoryBtn.addEventListener("click", async () => {
    if (!assertAdmin()) return;

    const selected = els.renameCategorySelect.value;
    const newName = els.renameCategoryInput.value.trim();
    if (!selected || !newName) {
      alert("请选择要重命名的栏目，并输入新名称。");
      return;
    }

    const parts = selected.split(">>");
    const isSubCategory = parts.length === 2;

    await manageCategoryRequest(els, {
      method: "PUT",
      body: {
        password: adminPassword,
        action: isSubCategory ? "renameSubCategory" : "renameCategory",
        categoryName: parts[0],
        subCategoryName: isSubCategory ? parts[1] : "",
        newCategoryName: isSubCategory ? "" : newName,
        newSubCategoryName: isSubCategory ? newName : ""
      },
      refreshFiles: true,
      onSuccess: () => {
        els.renameCategoryInput.value = "";
      }
    });
  });

  els.deleteCategoryBtn.addEventListener("click", async () => {
    if (!assertAdmin()) return;

    const selected = els.deleteCategorySelect.value;
    if (!selected) {
      alert("请选择要删除的栏目。");
      return;
    }

    if (!window.confirm("确认删除这个栏目以及栏目下的全部文件吗？")) {
      return;
    }

    const parts = selected.split(">>");
    const isSubCategory = parts.length === 2;

    await manageCategoryRequest(els, {
      method: "DELETE",
      body: {
        password: adminPassword,
        action: isSubCategory ? "deleteSubCategory" : "deleteCategory",
        categoryName: parts[0],
        subCategoryName: isSubCategory ? parts[1] : ""
      },
      refreshFiles: true
    });
  });

  els.uploadBtn.addEventListener("click", async () => {
    if (!assertAdmin()) {
      showUploadStatus(els, "请先登录管理员账号。", "error");
      return;
    }

    const selectedCategoryPath = decodePathValue(els.categorySelect.value);
    const category = selectedCategoryPath[0] || els.categorySelect.value;
    const files = Array.from(els.fileInput.files || []);
    const subCategory = els.subCategoryInput.value.trim() || els.subCategorySelect.value.trim();

    if (!category) {
      showUploadStatus(els, "请选择大栏目。", "error");
      return;
    }

    if (files.length === 0) {
      showUploadStatus(els, "请选择要上传的文件。", "error");
      return;
    }

    const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalSize > 10 * 1024 * 1024) {
      showUploadStatus(els, "当前存储方案下，本次上传文件总大小不能超过 10MB。", "error");
      return;
    }

    els.uploadBtn.disabled = true;
    els.uploadBtn.textContent = "上传...";
    showUploadStatus(els, files.length > 1 ? "正在批量上传文件，请稍候..." : "正在上传文件，请稍候...", "success");

    try {
      let uploadedCount = 0;
      for (const [index, file] of files.entries()) {
        showUploadStatus(
          els,
          files.length > 1
            ? `正在上传第 ${index + 1}/${files.length} 个文件：${file.name}`
            : `正在上传文件：${file.name}`,
          "success"
        );

        const response = await fetch(`${API_BASE_URL}/api/upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: adminPassword,
            fileName: file.name,
            category,
            subCategory,
            categoryPath: subCategory ? [...selectedCategoryPath, subCategory] : selectedCategoryPath
          })
        });

        const result = await readJsonResponse(response);
        if (!response.ok || !result.success) {
          throw new Error(result.error || `文件 ${file.name} 上传失败。`);
        }

        const uploadResult = await uploadFileToCloudinary(file, result, (message) => {
          showUploadStatus(els, files.length > 1 ? `${message}（${index + 1}/${files.length}）` : message, "success");
        });

        const uploadedFile = mapDirectUploadResult(uploadResult, {
          file,
          category,
          subCategory,
          categoryPath: subCategory ? [...selectedCategoryPath, subCategory] : selectedCategoryPath
        });

        if (uploadedFile) {
          allFilesData = allFilesData.filter((item) => item.publicId !== uploadedFile.publicId);
          allFilesData.unshift(uploadedFile);
          sortFilesByUploadTimeDesc(allFilesData);
        }

        uploadedCount += 1;
      }

      if (subCategory && !hasSubCategory(category, subCategory)) {
        upsertCategory(category, [subCategory]);
      } else {
        upsertCategory(category, []);
      }

      els.fileInput.value = "";
      els.subCategoryInput.value = "";
      els.subCategorySelect.value = "";
      showUploadStatus(els, uploadedCount > 1 ? `批量上传成功，共上传 ${uploadedCount} 个文件。` : "上传成功。", "success");
      syncCategoryViews(els, {
        selectedCategory: category,
        activeCategory: category
      });
      renderAllCategoryViews(els);

      await Promise.all([loadCategories(els), loadFileList(els)]);
      syncCategoryViews(els, {
        selectedCategory: category,
        activeCategory: category
      });
      renderFileList(els);
    } catch (error) {
      console.error("Upload failed:", error);
      showUploadStatus(els, error.message || "上传失败。", "error");
    } finally {
      els.uploadBtn.disabled = false;
      els.uploadBtn.textContent = "上传文件";
    }
  });
}


function assertAdmin() {
  if (!isLoggedIn) {
    alert("请先登录管理员账号。");
    return false;
  }
  return true;
}

async function verifyPassword(els, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });

    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      showLoginStatus(els, result.error || "密码错误。", "error");
      return;
    }

    isLoggedIn = true;
    adminPassword = password;
    showLoginStatus(els, "登录成功。", "success");
    els.loginSection.style.display = "none";
    els.adminSection.style.display = "block";
    await loadCategories(els);
    renderFileList(els);
  } catch (error) {
    console.error("Login failed:", error);
    showLoginStatus(els, error.message || "登录失败。", "error");
  }
}

async function manageCategoryRequest(els, { method, body, onSuccess, refreshFiles = false }) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/category`, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "操作失败。");
    }

    if (typeof onSuccess === "function") {
      await onSuccess(result);
    }

    await loadCategories(els);
    if (refreshFiles) {
      await loadFileList(els);
    } else {
      renderAllCategoryViews(els);
    }

    alert(result.message || "操作成功。");
  } catch (error) {
    console.error("Category request failed:", error);
    alert(error.message || "操作失败。");
  }
}

async function loadCategories(els) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/category`);
    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "加载栏目失败。");
    }

    allCategoriesData = normalizeCategoryTree(result.categories);
    initializeCategoryOrderDraft();
    renderAllCategoryViews(els);
  } catch (error) {
    console.error("Load categories failed:", error);
    allCategoriesData = [];
    initializeCategoryOrderDraft();
    renderAllCategoryViews(els);
  }
}

async function loadFileList(els) {
  els.fileList.innerHTML = '<p class="loading">正在加载资料列表...</p>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/files`);
    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "加载资料失败。");
    }

    allFilesData = Array.isArray(result.files) ? result.files : [];
    renderFileList(els);
  } catch (error) {
    console.error("Load files failed:", error);
    allFilesData = [];
    els.fileList.innerHTML = '<p class="loading" style="color:#c53030;">加载失败，请稍后刷新重试。</p>';
  }
}


function renderAllCategoryViews(els) {
  renderCategorySelect(els);
  renderExternalCategorySelect(els);
  renderCategoryTabs(els);
  renderManagementSelects(els);
  renderCategoryOrderList(els);
  updateSubCategoryList(els, els.categorySelect.value);
  updateExternalSubCategoryList(els, els.externalCategorySelect?.value || "");
  renderFileList(els);
}


function renderExternalCategorySelect(els) {
  if (!els.externalCategorySelect) {
    return;
  }

  const selectedValue = els.externalCategorySelect.value;
  renderSelectWithPlaceholder(els.externalCategorySelect, "-- 请选择1级栏目 --");

  allCategoriesData.forEach((category) => {
    const value = encodePathValue(category.path);
    els.externalCategorySelect.appendChild(createOption(value, category.name));
  });

  if (allCategoriesData.some((item) => encodePathValue(item.path) === selectedValue)) {
    els.externalCategorySelect.value = selectedValue;
  }
}


function renderCategoryTabs(els) {
  els.categoryTabs.innerHTML = "";
  els.categoryTabs.appendChild(createTabButton("all", "全部资料", els));

  allCategoriesData.forEach((category) => {
    els.categoryTabs.appendChild(createTabButton(category.name, category.name, els));
  });

  if (currentCategory !== "all" && !allCategoriesData.some((item) => item.name === currentCategory)) {
    currentCategory = "all";
  }

  updateActiveTab(els);
}


function createTabButton(value, text, els) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tab-btn";
  button.dataset.category = value;
  button.textContent = text;
  button.addEventListener("click", () => {
    currentCategory = value;
    updateActiveTab(els);
    renderFileList(els);
  });
  return button;
}


function updateActiveTab(els) {
  els.categoryTabs.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === currentCategory);
  });
}


function normalizeCategoryNode(node, parentPath = []) {
  const name = String(node?.name || "").trim();
  const path = Array.isArray(node?.path) && node.path.length
    ? node.path.map((part) => String(part || "").trim()).filter(Boolean)
    : [...parentPath, name].filter(Boolean);
  const children = Array.isArray(node?.children)
    ? node.children.map((child) => normalizeCategoryNode(child, path)).filter((child) => child.name)
    : (node?.subCategories || []).map((childName) => normalizeCategoryNode({ name: childName }, path));

  return {
    ...node,
    name,
    path,
    children,
    subCategories: children.map((child) => child.name)
  };
}


function normalizeCategoryTree(categories) {
  return (Array.isArray(categories) ? categories : [])
    .map((category) => normalizeCategoryNode(category))
    .filter((category) => category.name);
}


function encodePathValue(path) {
  return JSON.stringify((path || []).filter(Boolean));
}


function decodePathValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((part) => String(part || "").trim()).filter(Boolean) : [];
  } catch (error) {
    return raw.split(">>").map((part) => part.trim()).filter(Boolean);
  }
}


function getPathLabel(path) {
  return (path || []).join(" / ");
}


function findCategoryNodeByPath(path, nodes = allCategoriesData) {
  let currentNodes = nodes || [];
  let currentNode = null;
  for (const part of path || []) {
    currentNode = currentNodes.find((item) => item.name === part);
    if (!currentNode) {
      return null;
    }
    currentNodes = currentNode.children || [];
  }
  return currentNode;
}


function flattenCategoryNodes(nodes = allCategoriesData, result = []) {
  nodes.forEach((node) => {
    result.push(node);
    flattenCategoryNodes(node.children || [], result);
  });
  return result;
}


function initializeCategoryOrderDraft() {
  const existingExpandedState = new Map(
    categoryOrderDraft.map((category) => [category.name, Boolean(category.expanded)])
  );

  categoryOrderDraft = allCategoriesData.map((category) => ({
    name: category.name,
    expanded: existingExpandedState.get(category.name) || false,
    subCategories: [...(category.subCategories || [])]
  }));
}


function renderCategoryOrderList(els) {
  if (!els.categoryOrderList) {
    return;
  }

  els.categoryOrderList.innerHTML = "";

  if (categoryOrderDraft.length === 0) {
    els.categoryOrderList.innerHTML = '<p class="loading">当前还没有可排序的栏目。</p>';
    return;
  }

  categoryOrderDraft.forEach((category, categoryIndex) => {
    const categoryCard = document.createElement("div");
    categoryCard.className = "order-card";
    if (categoryOrderMotion?.type === "category" && categoryOrderMotion?.name === category.name) {
      categoryCard.classList.add(categoryOrderMotion.direction === "up" ? "is-moving-up" : "is-moving-down");
    }
    categoryCard.innerHTML = `
      <div class="order-row">
        <div class="order-row-main">
          <button type="button" class="order-toggle-btn" aria-label="${category.expanded ? "收起子栏目" : "展开子栏目"}">
            ${category.subCategories.length > 0 ? `<span class="order-toggle-icon">${category.expanded ? "-" : "+"}</span>` : '<span class="order-toggle-icon order-toggle-icon-empty">.</span>'}
          </button>
          <span class="order-row-title">${escapeHtml(category.name)}</span>
        </div>
        <div class="order-controls">
          <button type="button" class="order-arrow-btn" data-direction="up" aria-label="调整顺序">^</button>
          <button type="button" class="order-arrow-btn" data-direction="down" aria-label="调整顺序">v</button>
        </div>
      </div>
    `;

    const toggleBtn = categoryCard.querySelector(".order-toggle-btn");
    const upBtn = categoryCard.querySelector('[data-direction="up"]');
    const downBtn = categoryCard.querySelector('[data-direction="down"]');

    if (category.subCategories.length > 0) {
      toggleBtn?.addEventListener("click", () => {
        category.expanded = !category.expanded;
        renderCategoryOrderList(els);
      });
    } else {
      toggleBtn.disabled = true;
    }

    upBtn?.addEventListener("click", () => {
      setCategoryOrderMotion({
        type: "category",
        name: category.name,
        direction: "up"
      });
      swapItems(categoryOrderDraft, categoryIndex, categoryIndex - 1);
      renderCategoryOrderList(els);
    });

    downBtn?.addEventListener("click", () => {
      setCategoryOrderMotion({
        type: "category",
        name: category.name,
        direction: "down"
      });
      swapItems(categoryOrderDraft, categoryIndex, categoryIndex + 1);
      renderCategoryOrderList(els);
    });

    if (categoryIndex === 0 && upBtn) {
      upBtn.disabled = true;
    }
    if (categoryIndex === categoryOrderDraft.length - 1 && downBtn) {
      downBtn.disabled = true;
    }

    els.categoryOrderList.appendChild(categoryCard);

    if (category.expanded && category.subCategories.length > 0) {
      const subList = document.createElement("div");
      subList.className = "order-sub-list";

      category.subCategories.forEach((subCategory, subIndex) => {
        const subCard = document.createElement("div");
        subCard.className = "order-sub-card";
        if (
          categoryOrderMotion?.type === "subCategory" &&
          categoryOrderMotion?.name === subCategory &&
          categoryOrderMotion?.parentName === category.name
        ) {
          subCard.classList.add(categoryOrderMotion.direction === "up" ? "is-moving-up" : "is-moving-down");
        }
        subCard.innerHTML = `
          <div class="order-row order-row-sub">
            <div class="order-row-main">
              <span class="order-row-title">${escapeHtml(subCategory)}</span>
            </div>
            <div class="order-controls">
              <button type="button" class="order-arrow-btn" data-direction="up" aria-label="调整顺序">^</button>
              <button type="button" class="order-arrow-btn" data-direction="down" aria-label="调整顺序">v</button>
            </div>
          </div>
        `;

        const subUpBtn = subCard.querySelector('[data-direction="up"]');
        const subDownBtn = subCard.querySelector('[data-direction="down"]');

        subUpBtn?.addEventListener("click", () => {
          setCategoryOrderMotion({
            type: "subCategory",
            parentName: category.name,
            name: subCategory,
            direction: "up"
          });
          swapItems(category.subCategories, subIndex, subIndex - 1);
          renderCategoryOrderList(els);
        });

        subDownBtn?.addEventListener("click", () => {
          setCategoryOrderMotion({
            type: "subCategory",
            parentName: category.name,
            name: subCategory,
            direction: "down"
          });
          swapItems(category.subCategories, subIndex, subIndex + 1);
          renderCategoryOrderList(els);
        });

        if (subIndex === 0 && subUpBtn) {
          subUpBtn.disabled = true;
        }
        if (subIndex === category.subCategories.length - 1 && subDownBtn) {
          subDownBtn.disabled = true;
        }

        subList.appendChild(subCard);
      });

      els.categoryOrderList.appendChild(subList);
    }
  });
}


function swapItems(list, fromIndex, toIndex) {
  if (!Array.isArray(list) || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) {
    return;
  }

  const temp = list[fromIndex];
  list[fromIndex] = list[toIndex];
  list[toIndex] = temp;
}


function setCategoryOrderMotion(motion) {
  categoryOrderMotion = motion;
  window.clearTimeout(setCategoryOrderMotion.timer);
  setCategoryOrderMotion.timer = window.setTimeout(() => {
    categoryOrderMotion = null;
  }, 220);
}

async function saveCategoryOrder(els) {
  if (!assertAdmin()) {
    return;
  }

  if (!els.saveCategoryOrderBtn) {
    return;
  }

  els.saveCategoryOrderBtn.disabled = true;
  showStatusMessage(els.categoryOrderStatus, "正在保存栏目排序...", "success");

  try {
    const response = await fetch(`${API_BASE_URL}/api/category`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: adminPassword,
        action: "saveOrder",
        order: categoryOrderDraft.map((category) => ({
          name: category.name,
          subCategories: [...category.subCategories]
        }))
      })
    });

    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "栏目排序保存失败。");
    }

    allCategoriesData = categoryOrderDraft.map((category) => ({
      name: category.name,
      subCategories: [...category.subCategories]
    }));
    renderAllCategoryViews(els);
    showStatusMessage(els.categoryOrderStatus, result.message || "栏目排序保存成功。", "success");
  } catch (error) {
    console.error("Save category order failed:", error);
    showStatusMessage(els.categoryOrderStatus, error.message || "栏目排序保存失败。", "error");
  } finally {
    els.saveCategoryOrderBtn.disabled = false;
  }
}


function mapDirectUploadResult(uploadResult, { file, category, subCategory, categoryPath = [] }) {
  const publicId = String(uploadResult.public_id || "").trim();
  if (!publicId) {
    return null;
  }

  return {
    name: file.name,
    publicId,
    resourceType: uploadResult.resource_type || "raw",
    downloadCount: 0,
    downloadUrl: `/api/download?publicId=${encodeURIComponent(publicId)}&resourceType=${encodeURIComponent(uploadResult.resource_type || "raw")}&fileName=${encodeURIComponent(file.name)}`,
    url: uploadResult.secure_url,
    type: getFileExtension(file.name) || uploadResult.format || "raw",
    size: formatFileSize(uploadResult.bytes || file.size),
    category,
    subCategory,
    categoryPath,
    uploadTime: uploadResult.created_at
      ? new Date(uploadResult.created_at).toLocaleString("zh-CN", { hour12: false })
      : new Date().toLocaleString("zh-CN", { hour12: false })
  };
}


function createFileItem(file, els) {
  const item = document.createElement("div");
  item.className = "file-item";

  const safeUrl = String(file.downloadUrl || file.url || "").trim();
  const fileType = file.type || "未知";
  const actionLabel = file.isExternal ? "前往下载" : "下载资料";
  const extractionCodeRow = file.isExternal
    ? `<div class="file-info">提取码：${escapeHtml(file.extractionCode || "无")}</div>`
    : "";
  const adminActions = isLoggedIn
    ? `
      <div class="file-actions">
        <button type="button" class="btn-file-action" data-action="move">移动</button>
        <button type="button" class="btn-file-action btn-file-danger" data-action="delete">删除</button>
      </div>
    `
    : "";

  item.innerHTML = `
    <div class="file-name">${escapeHtml(file.name)}</div>
    <div class="file-info">文件类型：${escapeHtml(fileType)}</div>
    <div class="file-info">文件大小：${escapeHtml(file.size || "未知")}</div>
    <div class="file-info">上传时间：${escapeHtml(file.uploadTime || "未知")}</div>
    <div class="file-info file-download-count">下载次数：${escapeHtml(file.downloadCount ?? 0)}</div>
    ${extractionCodeRow}
    <div class="file-card-footer">
      <a
        href="${escapeHtml(safeUrl)}"
        class="file-link"
        download="${escapeHtml(file.name)}"
        target="_blank"
        rel="noopener noreferrer"
      >${actionLabel}</a>
    </div>
    ${adminActions}
  `;

  const downloadLink = item.querySelector(".file-link");
  const downloadCountNode = item.querySelector(".file-download-count");

  downloadLink?.addEventListener("click", async (event) => {
    event.preventDefault();
    if (file.isExternal) {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
      return;
    }
    await startFileDownload(file, els, downloadCountNode);
  });

  if (isLoggedIn) {
    const moveBtn = item.querySelector('[data-action="move"]');
    const deleteBtn = item.querySelector('[data-action="delete"]');

    moveBtn?.addEventListener("click", async () => {
      await moveFile(els, file);
    });

    deleteBtn?.addEventListener("click", async () => {
      await deleteFile(els, file);
    });
  }

  return item;
}

async function addExternalLinkFile(els) {
  if (!assertAdmin()) {
    showStatusMessage(els.externalLinkStatus, "请先登录管理员账号。", "error");
    return;
  }

  const selectedCategoryPath = getSelectedExternalPath(els);
  const category = selectedCategoryPath[0] || "";
  const subCategory = els.externalSubCategoryInput?.value.trim() || selectedCategoryPath[selectedCategoryPath.length - 1] || "";
  const title = els.externalTitleInput?.value.trim() || "";
  const externalUrl = els.externalUrlInput?.value.trim() || "";
  const extractionCode = els.externalExtractionMode?.value === "custom"
    ? (els.externalExtractionInput?.value.trim() || "")
    : "";

  if (!category) {
    showStatusMessage(els.externalLinkStatus, "请选择大栏目。", "error");
    return;
  }
  if (!title) {
    showStatusMessage(els.externalLinkStatus, "请输入资料标题。", "error");
    return;
  }
  if (!externalUrl) {
    showStatusMessage(els.externalLinkStatus, "请输入外部下载链接。", "error");
    return;
  }
  if (els.externalExtractionMode?.value === "custom" && !extractionCode) {
    showStatusMessage(els.externalLinkStatus, "请输入提取码，或选择无。", "error");
    return;
  }

  if (els.addExternalLinkBtn) {
    els.addExternalLinkBtn.disabled = true;
  }
  showStatusMessage(els.externalLinkStatus, "正在添加外部资料...", "success");

  try {
    const response = await fetch(`${API_BASE_URL}/api/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: adminPassword,
        action: "addExternalLink",
        title,
        externalUrl,
        extractionCode,
        targetCategory: category,
        targetSubCategory: subCategory,
        targetCategoryPath: selectedCategoryPath
      })
    });

    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "外部资料添加失败。");
    }

    upsertCategoryPath(selectedCategoryPath);

    if (els.externalTitleInput) {
      els.externalTitleInput.value = "";
    }
    if (els.externalUrlInput) {
      els.externalUrlInput.value = "";
    }
    if (els.externalSubCategoryInput) {
      els.externalSubCategoryInput.value = "";
    }
    if (els.externalSubCategorySelect) {
      els.externalSubCategorySelect.value = "";
    }
    if (els.externalExtractionMode) {
      els.externalExtractionMode.value = "none";
    }
    if (els.externalExtractionInput) {
      els.externalExtractionInput.value = "";
      els.externalExtractionInput.disabled = true;
    }

    syncCategoryViews(els, {
      selectedCategory: category,
      activeCategory: category
    });
    await Promise.all([loadCategories(els), loadFileList(els)]);
    syncCategoryViews(els, {
      selectedCategory: category,
      activeCategory: category
    });
    renderAllCategoryViews(els);
    showStatusMessage(els.externalLinkStatus, result.message || "外部资料添加成功。", "success");
  } catch (error) {
    console.error("Add external link failed:", error);
    showStatusMessage(els.externalLinkStatus, error.message || "外部资料添加失败。", "error");
  } finally {
    if (els.addExternalLinkBtn) {
      els.addExternalLinkBtn.disabled = false;
    }
  }
}


function openMoveModal(els, file) {
  if (!els.moveFileModal || !els.moveFileName || !els.moveCategorySelect || !els.moveSubCategorySelect) {
    alert("当前页面尚未完整加载移动功能，请刷新页面后重试。");
    return;
  }
  pendingMoveFile = file;
  els.moveFileName.textContent = `移动文件：${file.name}`;
  showStatusMessage(els.moveStatus, "", "");
  renderManagementSelects(els);
  const filePath = file.categoryPath || [file.category, file.subCategory].filter(Boolean);
  els.moveCategorySelect.value = encodePathValue(filePath.length ? [filePath[0]] : []);
  renderMoveSubCategoryOptions(els, els.moveCategorySelect.value, filePath[1] || "");
  els.moveFileModal.classList.add("show");
}


function closeMoveModal(els) {
  if (!els.moveFileModal) {
    return;
  }
  pendingMoveFile = null;
  showStatusMessage(els.moveStatus, "", "");
  els.moveFileModal.classList.remove("show");
  els.moveCategorySelect.value = "";
  renderMoveSubCategoryOptions(els, "", "");
}


function renderMoveSubCategoryOptions(els, categoryName, selectedSubCategory) {
  if (!els.moveSubCategorySelect) {
    return;
  }
  renderSelectWithPlaceholder(els.moveSubCategorySelect, "-- 直接放在大栏目下 --");
  if (!categoryName) {
    return;
  }

  const category = findCategoryNodeByPath(decodePathValue(categoryName));
  (category?.children || []).forEach((child) => {
    els.moveSubCategorySelect.appendChild(createOption(child.name, child.name));
  });

  if (
    selectedSubCategory &&
    (category?.children || []).some((child) => child.name === selectedSubCategory)
  ) {
    els.moveSubCategorySelect.value = selectedSubCategory;
  }
}

async function submitMoveFile(els) {
  if (!assertAdmin()) return;
  if (!pendingMoveFile) {
    showStatusMessage(els.moveStatus, "未找到要移动的文件。", "error");
    return;
  }

  const targetBasePath = decodePathValue(els.moveCategorySelect.value.trim());
  const targetCategory = targetBasePath[0] || "";
  const targetSubCategory = els.moveSubCategorySelect.value.trim();
  const targetCategoryPath = targetSubCategory ? [...targetBasePath, targetSubCategory] : targetBasePath;

  if (!targetCategory) {
    showStatusMessage(els.moveStatus, "请选择目标大栏目。", "error");
    return;
  }

  els.confirmMoveBtn.disabled = true;
  showStatusMessage(els.moveStatus, "正在移动文件，请稍候...", "success");

  try {
    const response = await fetch(`${API_BASE_URL}/api/files`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: adminPassword,
        publicId: pendingMoveFile.publicId,
        resourceType: pendingMoveFile.resourceType,
        targetCategory,
        targetSubCategory,
        targetCategoryPath
      })
    });

    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "移动失败。");
    }

    const movedFile = result.file || {
      ...pendingMoveFile,
      category: targetCategory,
      subCategory: targetSubCategory,
      categoryPath: targetCategoryPath
    };

    allFilesData = allFilesData
      .filter((item) => item.publicId !== pendingMoveFile.publicId)
      .concat(movedFile);
    sortFilesByUploadTimeDesc(allFilesData);

    upsertCategoryPath(targetCategoryPath);
    syncCategoryViews(els, {
      selectedCategory: targetCategory,
      activeCategory: targetCategory
    });
    renderAllCategoryViews(els);

    showStatusMessage(els.moveStatus, result.message || "文件移动成功。", "success");

    window.setTimeout(() => {
      closeMoveModal(els);
    }, 700);
  } catch (error) {
    console.error("Move file failed:", error);
    showStatusMessage(els.moveStatus, error.message || "移动失败。", "error");
  } finally {
    els.confirmMoveBtn.disabled = false;
  }
}

async function deleteFile(els, file) {
  if (!assertAdmin()) return;

  if (!file?.publicId || !file?.resourceType) {
    alert("无法删除该文件，因为缺少文件标识。");
    return;
  }

  if (!window.confirm(`确认删除文件“${file.name}”吗？`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/files`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: adminPassword,
        publicId: file.publicId,
        resourceType: file.resourceType
      })
    });

    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || "删除失败。");
    }

    await Promise.all([loadFileList(els), loadCategories(els)]);
    alert(result.message || "文件删除成功。");
  } catch (error) {
    console.error("Delete file failed:", error);
    alert(error.message || "删除失败。");
  }
}

async function moveFile(els, file) {
  if (!assertAdmin()) return;

  if (!file?.publicId || !file?.resourceType) {
    alert("无法移动该文件，因为缺少文件标识。");
    return;
  }
  openMoveModal(els, file);
}


function executeSearch(els) {
  if (!els.searchInput || !els.searchModal || !els.searchResultList) {
    alert("当前页面尚未完整加载搜索功能，请刷新页面后重试。");
    return;
  }
  const keyword = els.searchInput.value.trim();
  if (!keyword) {
    showStatusMessage(els.searchStatus, "请输入要搜索的关键词。", "error");
    return;
  }

  const results = allFilesData
    .filter((file) => isSearchableFile(file))
    .map((file) => ({
      file,
      score: calculateSearchScore(keyword, file)
    }))
    .filter((item) => item.score >= 15)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const timeGap =
        (Date.parse(right.file?.uploadTime || "") || 0) -
        (Date.parse(left.file?.uploadTime || "") || 0);
      if (timeGap !== 0) {
        return timeGap;
      }
      return String(left.file?.name || "").localeCompare(String(right.file?.name || ""), "zh-CN");
    });

  searchResultsData = results;
  currentSearchPage = 1;

  if (results.length === 0) {
    showStatusMessage(els.searchStatus, "未找到相关资料。", "error");
  } else {
    showStatusMessage(els.searchStatus, `搜索完成，找到 ${results.length} 条相关资料。`, "success");
  }

  els.searchKeywordLabel.textContent = `关键词：${keyword}`;
  els.searchResultMeta.textContent = `共 ${results.length} 条结果，按相关度降序排列`;
  renderSearchResults(els);
  els.searchModal.classList.add("show");
}


function renderSearchResults(els) {
  if (!els.searchResultList || !els.searchPagination || !els.searchPageInfo || !els.searchPrevBtn || !els.searchNextBtn) {
    return;
  }
  els.searchResultList.innerHTML = "";

  if (searchResultsData.length === 0) {
    els.searchResultList.innerHTML = '<p class="loading">没有找到相关资料，请尝试更换关键词。</p>';
    els.searchPagination.style.display = "none";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(searchResultsData.length / SEARCH_PAGE_SIZE));
  if (currentSearchPage > totalPages) {
    currentSearchPage = totalPages;
  }

  const startIndex = (currentSearchPage - 1) * SEARCH_PAGE_SIZE;
  const pageItems = searchResultsData.slice(startIndex, startIndex + SEARCH_PAGE_SIZE);

  pageItems.forEach(({ file, score }) => {
    els.searchResultList.appendChild(createSearchResultCard(file, score));
  });

  els.searchPagination.style.display = totalPages > 1 ? "flex" : "none";
  els.searchPageInfo.textContent = `第 ${currentSearchPage} / ${totalPages} 页`;
  els.searchPrevBtn.disabled = currentSearchPage <= 1;
  els.searchNextBtn.disabled = currentSearchPage >= totalPages;
}


function createSearchResultCard(file, score) {
  const card = document.createElement("div");
  card.className = "search-result-card";
  const actionLabel = file.isExternal ? "前往下载" : "下载资料";
  card.innerHTML = `
    <div class="search-result-head">
      <div class="file-name">${escapeHtml(file.name)}</div>
      <div class="search-result-score">相关度：${score.toFixed(2)}%</div>
    </div>
    <div class="search-result-source">
      来源：${escapeHtml(file.category || "未分类")}${file.subCategory ? ` / ${escapeHtml(file.subCategory)}` : ""}
    </div>
    <div class="file-info">文件类型：${escapeHtml(file.type || "未知")}</div>
    <div class="file-info">文件大小：${escapeHtml(file.size || "未知")}</div>
    <div class="file-info">上传时间：${escapeHtml(file.uploadTime || "未知")}</div>
    <div class="file-info">下载次数：${escapeHtml(file.downloadCount ?? 0)}</div>
    ${file.isExternal ? `<div class="file-info">提取码：${escapeHtml(file.extractionCode || "无")}</div>` : ""}
    <a
      href="${escapeHtml(String(file.downloadUrl || file.url || "").trim())}"
      class="file-link"
      download="${escapeHtml(file.name)}"
      target="_blank"
      rel="noopener noreferrer"
    >${actionLabel}</a>
  `;

  const downloadLink = card.querySelector(".file-link");
  downloadLink?.addEventListener("click", async (event) => {
    event.preventDefault();
    if (file.isExternal) {
      window.open(String(file.downloadUrl || file.url || "").trim(), "_blank", "noopener,noreferrer");
      return;
    }
    await startFileDownload(file, getPageElements());
  });

  return card;
}


function getPageElements() {
  return {
    downloadStatusToast: document.getElementById("downloadStatusToast"),
    downloadStatusTitle: document.getElementById("downloadStatusTitle"),
    downloadStatusMessage: document.getElementById("downloadStatusMessage"),
    downloadProgressBar: document.getElementById("downloadProgressBar")
  };
}

async function startFileDownload(file, els, countNode) {
  const downloadUrl = String(file?.downloadUrl || "").trim();
  if (!downloadUrl) {
    showDownloadToast(els, {
      title: "下载失败",
      message: "未找到有效的下载地址。",
      progress: 0,
      type: "error",
      autoHide: true
    });
    return;
  }

  if (activeDownloadAbortController) {
    activeDownloadAbortController.abort();
  }

  const controller = new AbortController();
  activeDownloadAbortController = controller;

  showDownloadToast(els, {
    title: "准备下载",
    message: `正在获取 ${file.name}...`,
    progress: 8,
    type: "success"
  });

  try {
    const response = await fetch(downloadUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(parseDownloadError(errorText) || `下载失败：${response.status}`);
    }

    const totalBytes = Number.parseInt(response.headers.get("content-length") || "0", 10);
    const fileBlob = await readDownloadBlob(response, totalBytes, els, file.name);
    triggerBrowserDownload(fileBlob, resolveDownloadFileName(response, file.name));

    const nextCount = Number(file.downloadCount || 0) + 1;
    file.downloadCount = nextCount;
    if (countNode) {
      countNode.textContent = `下载次数：${nextCount}`;
    }

    updateSearchResultDownloadCount(file.publicId, nextCount);

    showDownloadToast(els, {
      title: "下载已开始",
      message: `${file.name} 已发送到浏览器下载队列。`,
      progress: 100,
      type: "success",
      autoHide: true
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error("Download failed:", error);
    showDownloadToast(els, {
      title: "下载失败",
      message: error.message || "文件下载失败，请稍后重试。",
      progress: 0,
      type: "error",
      autoHide: true
    });
  } finally {
    if (activeDownloadAbortController === controller) {
      activeDownloadAbortController = null;
    }
  }
}

async function readDownloadBlob(response, totalBytes, els, fileName) {
  if (!response.body || typeof response.body.getReader !== "function") {
    showDownloadToast(els, {
      title: "正在下载",
      message: `正在接收 ${fileName}...`,
      progress: totalBytes > 0 ? 60 : 75,
      type: "success"
    });
    return response.blob();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength;
    }

    const progress = totalBytes > 0
      ? Math.min(96, Math.max(8, (receivedBytes / totalBytes) * 100))
      : Math.min(96, 8 + chunks.length * 12);

    showDownloadToast(els, {
      title: "正在下载",
      message: totalBytes > 0
        ? `${fileName}：${formatDownloadBytes(receivedBytes)} / ${formatDownloadBytes(totalBytes)}`
        : `${fileName}：已接收 ${formatDownloadBytes(receivedBytes)}`,
      progress,
      type: "success"
    });
  }

  return new Blob(chunks, {
    type: response.headers.get("content-type") || "application/octet-stream"
  });
}


function triggerBrowserDownload(fileBlob, fileName) {
  const blobUrl = URL.createObjectURL(fileBlob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
}


function resolveDownloadFileName(response, fallbackName) {
  const disposition = String(response.headers.get("content-disposition") || "");
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }

  const asciiMatch = disposition.match(/filename="?([^"]+)"?/i);
  return asciiMatch?.[1] || fallbackName || "download";
}


function parseDownloadError(errorText) {
  if (!errorText) {
    return "";
  }

  try {
    const parsed = JSON.parse(errorText);
    return parsed?.error || "";
  } catch (error) {
    return "";
  }
}


function updateSearchResultDownloadCount(publicId, nextCount) {
  searchResultsData = searchResultsData.map((item) => {
    if (item.file?.publicId !== publicId) {
      return item;
    }

    return {
      ...item,
      file: {
        ...item.file,
        downloadCount: nextCount
      }
    };
  });
}


function showDownloadToast(els, { title, message, progress = 0, type = "success", autoHide = false }) {
  const toast = els?.downloadStatusToast;
  const titleNode = els?.downloadStatusTitle;
  const messageNode = els?.downloadStatusMessage;
  const progressBar = els?.downloadProgressBar;

  if (!toast || !titleNode || !messageNode || !progressBar) {
    return;
  }

  titleNode.textContent = title;
  messageNode.textContent = message;
  progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  toast.classList.add("show");
  toast.classList.toggle("error", type === "error");

  window.clearTimeout(showDownloadToast.timer);
  if (autoHide) {
    showDownloadToast.timer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, type === "error" ? 3600 : 2200);
  }
}


function formatDownloadBytes(bytes) {
  const value = Number(bytes);
  if (!value || Number.isNaN(value)) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}


function closeSearchModal(els) {
  if (!els.searchModal) {
    return;
  }
  els.searchModal.classList.remove("show");
}


function calculateSearchScore(keyword, file) {
  const normalizedKeyword = normalizeSearchText(keyword);
  const normalizedName = normalizeSearchText(file?.name || "");

  if (!normalizedKeyword || !normalizedName) {
    return 0;
  }

  if (normalizedName === normalizedKeyword) {
    return 100;
  }

  let score = 0;
  const keywordTokens = splitSearchTokens(keyword);
  const nameTokens = splitSearchTokens(file?.name || "");

  keywordTokens.forEach((token) => {
    const normalizedToken = normalizeSearchText(token);
    if (!normalizedToken) {
      return;
    }

    if (normalizedName.includes(normalizedToken)) {
      score += 28;
    } else {
      const tokenChars = Array.from(new Set(normalizedToken.split("")));
      const hitCount = tokenChars.filter((char) => normalizedName.includes(char)).length;
      if (tokenChars.length > 0) {
        score += (hitCount / tokenChars.length) * 16;
      }
    }
  });

  const tokenOverlap = keywordTokens.length
    ? keywordTokens.filter((token) => {
        const normalizedToken = normalizeSearchText(token);
        return normalizedToken && nameTokens.some((nameToken) => nameToken.includes(normalizedToken) || normalizedToken.includes(nameToken));
      }).length / keywordTokens.length
    : 0;
  score += tokenOverlap * 24;

  const sequenceRatio = longestCommonSubsequenceRatio(normalizedKeyword, normalizedName);
  score += sequenceRatio * 24;

  const containmentRatio = normalizedKeyword.length <= normalizedName.length
    ? normalizedKeyword.split("").filter((char) => normalizedName.includes(char)).length / normalizedKeyword.length
    : normalizedName.split("").filter((char) => normalizedKeyword.includes(char)).length / normalizedName.length;
  score += containmentRatio * 16;

  return Math.max(0, Math.min(100, score));
}


function isSearchableFile(file) {
  const publicId = String(file?.publicId || "").trim();
  const name = String(file?.name || "").trim();
  const category = String(file?.category || "").trim();

  if (!name || !category) {
    return false;
  }

  if (publicId.includes("/__config/") || publicId.endsWith("/__placeholder")) {
    return false;
  }

  if (name === "__placeholder" || name === "links" || category === "__config") {
    return false;
  }

  return true;
}


function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,10}$/i, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function splitSearchTokens(value) {
  return String(value || "")
    .split(/[\s/\\_\-.，。；、]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}


function longestCommonSubsequenceRatio(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const previous = new Array(b.length + 1).fill(0);
  const current = new Array(b.length + 1).fill(0);

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      current[col] = a[row - 1] === b[col - 1]
        ? previous[col - 1] + 1
        : Math.max(previous[col], current[col - 1]);
    }
    for (let col = 0; col <= b.length; col += 1) {
      previous[col] = current[col];
      current[col] = 0;
    }
  }

  return previous[b.length] / Math.max(a.length, b.length);
}


function bindEnhancedCategoryEvents(els) {
  ensureHierarchicalPickerBindings(els);

  els.addSubCategoryBtn?.addEventListener("click", async (event) => {
    const parentPath = decodePathValue(els.parentCategorySelect?.value || "");
    if (parentPath.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!assertAdmin()) return;
    const nextName = els.newSubCategoryName.value.trim();
    if (!nextName) {
      alert("请输入子栏目名称。");
      return;
    }
    if (parentPath.length >= MAX_CATEGORY_DEPTH) {
      alert(`栏目最多只能创建到 ${MAX_CATEGORY_DEPTH} 级。`);
      return;
    }

    await manageCategoryRequest(els, {
      method: "POST",
      body: {
        password: adminPassword,
        action: "addCategoryNode",
        parentPath,
        newCategoryName: nextName
      },
      onSuccess: () => {
        els.newSubCategoryName.value = "";
        syncCategoryViews(els, {
          selectedCategory: parentPath[0],
          activeCategory: parentPath[0]
        });
      }
    });
  }, true);

  els.renameCategoryBtn?.addEventListener("click", async (event) => {
    const categoryPath = decodePathValue(els.renameCategorySelect?.value || "");
    if (categoryPath.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!assertAdmin()) return;
    const newName = els.renameCategoryInput.value.trim();
    if (!newName) {
      alert("请输入新栏目名称。");
      return;
    }

    await manageCategoryRequest(els, {
      method: "PUT",
      body: {
        password: adminPassword,
        action: "renameCategoryNode",
        categoryPath,
        newCategoryName: newName
      },
      refreshFiles: true,
      onSuccess: () => {
        els.renameCategoryInput.value = "";
      }
    });
  }, true);

  els.deleteCategoryBtn?.addEventListener("click", async (event) => {
    const categoryPath = decodePathValue(els.deleteCategorySelect?.value || "");
    if (categoryPath.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    await deleteCategoryPath(els, categoryPath);
  }, true);

  els.uploadBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    await submitHierarchicalUpload(els);
  }, true);

  els.addExternalLinkBtn?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    await submitHierarchicalExternalLink(els);
  }, true);
}


function ensureHierarchicalPickerBindings(els) {
  setupHierarchicalPicker(els, {
    rootSelect: els.categorySelect,
    firstChildSelect: els.subCategorySelect,
    textInput: els.subCategoryInput,
    containerId: "uploadCategoryPathContainer",
    placeholder: "-- 不使用下一级栏目 --"
  });

  setupHierarchicalPicker(els, {
    rootSelect: els.externalCategorySelect,
    firstChildSelect: els.externalSubCategorySelect,
    textInput: els.externalSubCategoryInput,
    containerId: "externalCategoryPathContainer",
    placeholder: "-- 不使用下一级栏目 --"
  });
}


function setupHierarchicalPicker(els, config) {
  const { rootSelect, firstChildSelect, textInput, containerId, placeholder } = config;
  if (!rootSelect || !firstChildSelect) {
    return;
  }

  const wrapper = firstChildSelect.parentElement;
  if (!wrapper) {
    return;
  }

  let host = wrapper.querySelector(`#${containerId}`);
  if (!host) {
    host = document.createElement("div");
    host.id = containerId;
    host.className = "category-path-selectors";
    wrapper.insertBefore(host, textInput || null);
  }

  firstChildSelect.dataset.placeholder = placeholder;
  firstChildSelect.dataset.dynamicRoot = rootSelect.id;
  host.dataset.dynamicRoot = rootSelect.id;

  if (!rootSelect.dataset.hierarchicalBound) {
    rootSelect.addEventListener("change", () => {
      if (rootSelect === els.categorySelect) {
        updateSubCategoryList(els, rootSelect.value);
      } else if (rootSelect === els.externalCategorySelect) {
        updateExternalSubCategoryList(els, rootSelect.value);
      }
    });
    rootSelect.dataset.hierarchicalBound = "true";
  }

  if (!host.dataset.bound) {
    const rerender = () => {
      const currentPath = getHierarchicalPickerPath(rootSelect, firstChildSelect, host);
      renderNestedCategorySelectors(currentPath, host, placeholder);
    };
    firstChildSelect.addEventListener("change", rerender);
    host.addEventListener("change", rerender);
    host.dataset.bound = "true";
  }
}


function renderSelectWithPlaceholder(select, text) {
  if (!select) {
    return;
  }
  select.innerHTML = "";
  select.appendChild(createOption("", text));
}


function renderManagementSelects(els) {
  renderSelectWithPlaceholder(els.parentCategorySelect, "-- 选择父级栏目 --");
  renderSelectWithPlaceholder(els.renameCategorySelect, "-- 选择要重命名的栏目 --");
  renderSelectWithPlaceholder(els.deleteCategorySelect, "-- 选择要删除的栏目 --");
  renderSelectWithPlaceholder(els.moveCategorySelect, "-- 请选择目标栏目 --");

  flattenCategoryNodes().forEach((category) => {
    const level = category.path.length;
    const value = encodePathValue(category.path);
    const label = `${level}级栏目：${getPathLabel(category.path)}`;

    if (els.parentCategorySelect && level < MAX_CATEGORY_DEPTH) {
      els.parentCategorySelect.appendChild(createOption(value, label));
    }
    if (els.renameCategorySelect) {
      els.renameCategorySelect.appendChild(createOption(value, label));
    }
    if (els.deleteCategorySelect) {
      els.deleteCategorySelect.appendChild(createOption(value, label));
    }
    if (els.moveCategorySelect && level === 1) {
      els.moveCategorySelect.appendChild(createOption(value, label));
    }
  });

  renderDeleteCategoryTree(els);
}


function renderDeleteCategoryTree(els) {
  let host = document.getElementById("deleteCategoryTree");
  if (!host && els.deleteCategorySelect) {
    host = document.createElement("div");
    host.id = "deleteCategoryTree";
    host.className = "delete-category-tree";
    els.deleteCategorySelect.closest(".manage-section")?.appendChild(host);
  }
  if (!host) {
    return;
  }

  host.innerHTML = "";
  if (allCategoriesData.length === 0) {
    host.innerHTML = '<p class="loading">暂无可删除栏目。</p>';
    return;
  }

  allCategoriesData.forEach((category) => {
    host.appendChild(createDeleteCategoryCard(els, category));
  });
}


function createDeleteCategoryCard(els, category) {
  const card = document.createElement("div");
  card.className = "delete-category-card";

  const row = document.createElement("div");
  row.className = "delete-category-row";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "order-toggle-btn";
  toggle.innerHTML = `<span class="order-toggle-icon">${(category.children || []).length ? ">" : "."}</span>`;
  toggle.disabled = !(category.children || []).length;

  const title = document.createElement("button");
  title.type = "button";
  title.className = "delete-category-title";
  title.textContent = `${category.path.length}级栏目：${getPathLabel(category.path)}`;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-danger delete-category-action";
  del.textContent = "删除";

  const children = document.createElement("div");
  children.className = "delete-category-children collapsed";
  children.hidden = true;
  let childrenRendered = false;
  let childrenRendering = false;
  const ensureChildrenRendered = () => {
    if (childrenRendered || childrenRendering) {
      return;
    }
    childrenRendering = true;
    children.replaceChildren(createEmptyText("正在加载子栏目..."));
    const tasks = (category.children || []).map((child) => () => createDeleteCategoryCard(els, child));
    renderTasksInChunks(children, tasks, {
      chunkSize: 5,
      onComplete: () => {
        childrenRendered = true;
        childrenRendering = false;
      }
    });
  };

  const pruneChildren = () => {
    if (!childrenRendered && !childrenRendering) {
      return;
    }
    childrenRendered = false;
    childrenRendering = false;
    children.replaceChildren();
  };

  const collapseTree = () => {
    collapseContent(children);
    toggle.querySelector(".order-toggle-icon").textContent = ">";
    pruneChildren();
  };

  card.__collapseTree = collapseTree;

  const toggleChildren = () => {
    if (!(category.children || []).length) {
      return;
    }
    const isOpening = children.classList.contains("collapsed");
    if (isOpening) {
      collapseSiblingTreeGroups(card);
      toggle.querySelector(".order-toggle-icon").textContent = "v";
      expandContent(children);
      window.requestAnimationFrame(ensureChildrenRendered);
    } else {
      collapseTree();
    }
  };

  toggle.addEventListener("click", toggleChildren);
  title.addEventListener("click", toggleChildren);
  del.addEventListener("click", async () => {
    await deleteCategoryPath(els, category.path);
  });

  row.appendChild(toggle);
  row.appendChild(title);
  row.appendChild(del);
  card.appendChild(row);
  card.appendChild(children);
  return card;
}

async function deleteCategoryPath(els, categoryPath) {
  if (!assertAdmin()) return;
  if (!Array.isArray(categoryPath) || categoryPath.length === 0) {
    alert("请选择要删除的栏目。");
    return;
  }

  const targetLabel = getPathLabel(categoryPath);
  const moveTarget = categoryPath.length === 1 ? "杂项资料" : getPathLabel(categoryPath.slice(0, -1));
  if (!window.confirm(`确认删除“${targetLabel}”吗？该栏目下所有文件会自动移动到“${moveTarget}”。`)) {
    return;
  }

  await manageCategoryRequest(els, {
    method: "DELETE",
    body: {
      password: adminPassword,
      action: "deleteCategoryNode",
      categoryPath
    },
    refreshFiles: true
  });
}


function preserveRootSelection(value) {
  const path = decodePathValue(value);
  return path.length ? encodePathValue([path[0]]) : "";
}


function populateHierarchicalPicker(rootSelect, firstChildSelect, containerId, categoryValue) {
  if (!firstChildSelect) {
    return;
  }

  const placeholder = firstChildSelect.dataset.placeholder || "-- 不使用下一级栏--";
  renderSelectWithPlaceholder(firstChildSelect, placeholder);

  const host = firstChildSelect.parentElement?.querySelector(`#${containerId}`);
  if (host) {
    host.innerHTML = "";
  }

  const path = decodePathValue(categoryValue);
  if (path.length === 0) {
    return;
  }

  const node = findCategoryNodeByPath(path);
  populateChildOptions(firstChildSelect, node?.children || []);
}


function populateChildOptions(select, children) {
  (children || []).forEach((child) => {
    select.appendChild(createOption(child.name, child.name));
  });
}


function renderNestedCategorySelectors(path, host, placeholder) {
  if (!host) {
    return;
  }

  host.innerHTML = "";
  let currentPath = [...(path || [])];
  let currentNode = findCategoryNodeByPath(currentPath);

  while (currentNode && (currentNode.children || []).length > 0) {
    const select = document.createElement("select");
    select.className = "dynamic-category-select";
    renderSelectWithPlaceholder(select, placeholder || `-- 请选择${currentNode.path.length + 1}级栏目 --`);
    populateChildOptions(select, currentNode.children || []);
    select.dataset.level = String(currentNode.path.length + 1);
    host.appendChild(select);

    const nextValue = path[currentNode.path.length];
    if (!nextValue) {
      break;
    }
    select.value = nextValue;
    if (select.value !== nextValue) {
      break;
    }
    currentPath = [...currentPath, nextValue];
    currentNode = findCategoryNodeByPath(currentPath);
  }
}


function getHierarchicalPickerPath(rootSelect, firstChildSelect, host) {
  const rootPath = decodePathValue(rootSelect?.value || "");
  if (rootPath.length === 0) {
    return [];
  }

  const path = [...rootPath];
  const values = [firstChildSelect, ...(host ? Array.from(host.querySelectorAll("select")) : [])]
    .map((select) => String(select?.value || "").trim())
    .filter(Boolean);

  values.forEach((value) => {
    path.push(value);
  });

  return path;
}


function getSelectedUploadPath(els) {
  const host = els.subCategorySelect?.parentElement?.querySelector("#uploadCategoryPathContainer");
  return getHierarchicalPickerPath(els.categorySelect, els.subCategorySelect, host);
}


function getSelectedExternalPath(els) {
  const host = els.externalSubCategorySelect?.parentElement?.querySelector("#externalCategoryPathContainer");
  return getHierarchicalPickerPath(els.externalCategorySelect, els.externalSubCategorySelect, host);
}


function getVisibleFilesByPathMap() {
  const map = new Map();
  allFilesData.forEach((file) => {
    if (!isSearchableFile(file) && !file.isExternal) {
      return;
    }
    const path = file.categoryPath || [file.category, file.subCategory].filter(Boolean);
    const key = encodePathValue(path);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(file);
  });
  return map;
}


function getFileCategoryPath(file) {
  return Array.isArray(file?.categoryPath) && file.categoryPath.length
    ? file.categoryPath.filter(Boolean)
    : [file?.category, file?.subCategory].filter(Boolean);
}


function pathStartsWith(path, prefix) {
  const fullPath = (path || []).filter(Boolean);
  const prefixPath = (prefix || []).filter(Boolean);
  if (prefixPath.length > fullPath.length) {
    return false;
  }
  return prefixPath.every((part, index) => fullPath[index] === part);
}


function getFilesForCategoryPath(categoryPath) {
  return allFilesData.filter((file) => isSameCategoryPath(getFileCategoryPath(file), categoryPath));
}


function ensureActiveCategoryPath(categoriesToRender) {
  const hasScopedPath = (path) => (path || []).length > 0
    && categoriesToRender.some((category) => pathStartsWith(path, category.path));
  const activeWasInvalid = currentActiveCategoryPath.length > 0 && !hasScopedPath(currentActiveCategoryPath);
  const expandedWasInvalid = currentExpandedCategoryPath.length > 0 && !hasScopedPath(currentExpandedCategoryPath);

  if (activeWasInvalid) {
    currentActiveCategoryPath = [];
  }

  if (expandedWasInvalid) {
    currentExpandedCategoryPath = [];
  }

  const shouldBootstrapFirstCategory = categoriesToRender.length > 0
    && (
      !hasInitializedCategoryBrowser
      || (activeWasInvalid && expandedWasInvalid)
    )
    && currentActiveCategoryPath.length === 0
    && currentExpandedCategoryPath.length === 0;

  if (shouldBootstrapFirstCategory) {
    currentActiveCategoryPath = [...categoriesToRender[0].path];
    currentExpandedCategoryPath = [...categoriesToRender[0].path];
    hasInitializedCategoryBrowser = true;
    return;
  }

  if (currentActiveCategoryPath.length === 0 && currentExpandedCategoryPath.length > 0) {
    currentActiveCategoryPath = [...currentExpandedCategoryPath];
  }
}


function createActiveFilesPanel() {
  const panel = document.createElement("section");
  panel.className = "active-files-panel";

  const selectedPath = [...currentActiveCategoryPath];
  const title = document.createElement("div");
  title.className = "active-files-header";
  title.innerHTML = `
    <div>
      <div class="active-files-title">${selectedPath.length ? escapeHtml(getPathLabel(selectedPath)) : "请选择栏目"}</div>
      <div class="active-files-subtitle">${selectedPath.length ? "当前栏目的资料文件" : "展开左侧栏目后在这里查看文件"}</div>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "active-files-list";

  const files = selectedPath.length ? getFilesForCategoryPath(selectedPath) : [];
  if (files.length === 0) {
    list.appendChild(createEmptyText(selectedPath.length ? "当前栏目下暂无文件，可继续展开子栏目。" : "请选择左侧栏目查看资料。"));
  } else {
    files.forEach((file) => {
      list.appendChild(createFileItem(file, getPageElements()));
    });
  }

  panel.appendChild(title);
  panel.appendChild(list);
  return panel;
}


function renderFileList(els) {
  els.fileList.innerHTML = "";

  const categoriesToRender = currentCategory === "all"
    ? allCategoriesData
    : allCategoriesData.filter((item) => item.name === currentCategory);

  if (categoriesToRender.length === 0) {
    els.fileList.innerHTML = '<p class="loading">当前栏目下暂无内容。</p>';
    return;
  }

  ensureActiveCategoryPath(categoriesToRender);
  const browser = document.createElement("div");
  browser.className = "category-browser-shell";

  const tree = document.createElement("div");
  tree.className = "category-browser-tree";

  categoriesToRender.forEach((category) => {
    tree.appendChild(createCategoryBlock(category, els));
  });

  browser.appendChild(tree);
  browser.appendChild(createActiveFilesPanel());
  els.fileList.appendChild(browser);
}


function setExpandedHeight(contentNode) {
  contentNode.classList.remove("collapsed");
  contentNode.hidden = false;
}


function createEmptyText(text) {
  const node = document.createElement("p");
  node.className = "loading";
  node.textContent = text;
  return node;
}


function upsertCategoryPath(categoryPath) {
  const path = (categoryPath || []).map((part) => String(part || "").trim()).filter(Boolean);
  if (path.length === 0) {
    return;
  }

  let currentNodes = allCategoriesData;
  let parentPath = [];
  path.forEach((part) => {
    let node = currentNodes.find((item) => item.name === part);
    if (!node) {
      node = normalizeCategoryNode({ name: part }, parentPath);
      currentNodes.push(node);
      currentNodes.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    parentPath = [...node.path];
    node.children = Array.isArray(node.children) ? node.children : [];
    node.subCategories = node.children.map((child) => child.name);
    currentNodes = node.children;
  });

  allCategoriesData = normalizeCategoryTree(allCategoriesData);
}

function upsertCategory(categoryName, subCategories) {
  const rootName = String(categoryName || "").trim();
  if (!rootName) {
    return;
  }

  const existingCategory = allCategoriesData.find((item) => item.name === rootName);
  if (!existingCategory) {
    const children = Array.from(new Set(subCategories.filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
      .map((name) => normalizeCategoryNode({ name }, [rootName]));
    allCategoriesData.push(normalizeCategoryNode({ name: rootName, children }));
  } else {
    const merged = new Set((existingCategory.children || []).map((child) => child.name));
    subCategories.forEach((name) => {
      if (name) {
        merged.add(name);
      }
    });
    existingCategory.children = Array.from(merged)
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
      .map((name) => normalizeCategoryNode({ name }, existingCategory.path));
    existingCategory.subCategories = existingCategory.children.map((child) => child.name);
  }

  allCategoriesData = normalizeCategoryTree(allCategoriesData).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}


function showLoginStatus(els, message, type) {
  els.loginStatus.textContent = message;
  els.loginStatus.className = `status-message ${type}`.trim();
  els.loginStatus.style.display = message ? "block" : "none";
}


function showUploadStatus(els, message, type) {
  showStatusMessage(els.uploadStatus, message, type);

  window.clearTimeout(showUploadStatus.timer);
  if (!message) {
    return;
  }

  showUploadStatus.timer = window.setTimeout(() => {
    els.uploadStatus.style.display = "none";
  }, 5000);
}


function showStatusMessage(node, message, type) {
  if (!node) {
    return;
  }
  node.textContent = message;
  node.className = `status-message ${type}`.trim();
  node.style.display = message ? "block" : "none";
}


function createOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}


function renderCategorySelect(els) {
  renderSelectWithPlaceholder(els.categorySelect, "-- 请选择1级栏目 --");
  renderSelectWithPlaceholder(els.externalCategorySelect, "-- 请选择1级栏目 --");

  allCategoriesData.forEach((category) => {
    const value = encodePathValue(category.path);
    els.categorySelect.appendChild(createOption(value, category.name));
    if (els.externalCategorySelect) {
      els.externalCategorySelect.appendChild(createOption(value, category.name));
    }
  });

  updateSubCategoryList(els, els.categorySelect.value);
  updateExternalSubCategoryList(els, els.externalCategorySelect?.value || "");
}


function updateSubCategoryList(els, categoryName) {
  renderSelectWithPlaceholder(els.subCategorySelect, "-- 不使用下一级栏目 --");
  const path = decodePathValue(categoryName);
  if (path.length === 0) {
    return;
  }

  const category = findCategoryNodeByPath(path);
  (category?.children || []).forEach((child) => {
    els.subCategorySelect.appendChild(createOption(child.name, child.name));
  });
}


function updateExternalSubCategoryList(els, categoryName) {
  renderSelectWithPlaceholder(els.externalSubCategorySelect, "-- 不使用下一级栏目 --");
  const path = decodePathValue(categoryName);
  if (path.length === 0) {
    return;
  }

  const category = findCategoryNodeByPath(path);
  (category?.children || []).forEach((child) => {
    els.externalSubCategorySelect.appendChild(createOption(child.name, child.name));
  });
}


function hasSubCategory(categoryName, subCategoryName) {
  const category = findCategoryNodeByPath(decodePathValue(categoryName));
  return Boolean(category && (category.children || []).some((child) => child.name === subCategoryName));
}


function isSameCategoryPath(left, right) {
  const leftPath = (left || []).filter(Boolean);
  const rightPath = (right || []).filter(Boolean);
  return leftPath.length === rightPath.length && leftPath.every((part, index) => part === rightPath[index]);
}


function syncCategoryViews(els, { selectedCategory = "", activeCategory = "all" } = {}) {
  const selectedNode = allCategoriesData.find((item) => item.name === selectedCategory);
  if (selectedNode) {
    els.categorySelect.value = encodePathValue(selectedNode.path);
  }

  currentCategory = activeCategory === "all" || allCategoriesData.some((item) => item.name === activeCategory)
    ? activeCategory
    : "all";

  updateSubCategoryList(els, els.categorySelect.value);
  updateActiveTab(els);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`接口返回格式异常：${text.slice(0, 160)}`);
  }
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function getFileExtension(fileName) {
  const parts = String(fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}


function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!value || Number.isNaN(value)) {
    return "未知";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}


function createUniqueUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


function createCategoryBlock(category, els) {
  return createCategoryTreeBlock(category, els, false);
}


function createSubCategoryBlock(category, els) {
  return createCategoryTreeBlock(category, els, true);
}


function getBranchChildren(category) {
  return Array.isArray(category?.children) ? category.children : [];
}


function isBranchExpanded(category) {
  if (!category?.path?.length || currentExpandedCategoryPath.length === 0) {
    return false;
  }
  return pathStartsWith(currentExpandedCategoryPath, category.path);
}


function updateCategoryBrowserState(category, els) {
  const nextPath = Array.isArray(category?.path) ? [...category.path] : [];
  const hasChildren = getBranchChildren(category).length > 0;
  const isSamePath = isSameCategoryPath(currentActiveCategoryPath, nextPath);
  const isExpanded = isSameCategoryPath(currentExpandedCategoryPath, nextPath);

  if (hasChildren && isSamePath && isExpanded) {
    currentExpandedCategoryPath = nextPath.slice(0, -1);
  } else {
    currentExpandedCategoryPath = hasChildren ? nextPath : nextPath.slice(0, -1);
  }

  currentActiveCategoryPath = nextPath;
  hasInitializedCategoryBrowser = true;
  renderFileList(els);
}


function createBranchChildrenContent(category, els, isChild) {
  const children = getBranchChildren(category);
  if (children.length === 0 || !isBranchExpanded(category)) {
    return null;
  }

  const content = document.createElement("div");
  content.className = `${isChild ? "sub-category-content" : "category-content"} branch-open`;
  const fragment = document.createDocumentFragment();

  children.forEach((child) => {
    fragment.appendChild(createSubCategoryBlock(child, els));
  });

  content.appendChild(fragment);
  return content;
}

function renderTasksInChunks(container, tasks, { chunkSize = 6, onComplete } = {}) {
  if (!container) {
    return;
  }

  let index = 0;
  container.replaceChildren();

  const runChunk = () => {
    const fragment = document.createDocumentFragment();
    let processed = 0;

    while (index < tasks.length && processed < chunkSize) {
      fragment.appendChild(tasks[index]());
      index += 1;
      processed += 1;
    }

    container.appendChild(fragment);

    if (index < tasks.length) {
      window.requestAnimationFrame(runChunk);
      return;
    }

    if (typeof onComplete === "function") {
      onComplete();
    }
  };

  window.requestAnimationFrame(runChunk);
}


function collapseSiblingTreeGroups(currentGroup) {
  const parent = currentGroup?.parentElement;
  if (!parent) {
    return;
  }

  Array.from(parent.children).forEach((child) => {
    if (child === currentGroup) {
      return;
    }
    if (typeof child.__collapseTree === "function") {
      child.__collapseTree();
    }
  });
}


function createCategoryTreeBlock(category, els, isChild) {
  const depth = Math.min(((category && category.path) || []).length || 1, MAX_CATEGORY_DEPTH);
  const hasChildren = getBranchChildren(category).length > 0;
  const isActive = isSameCategoryPath(currentActiveCategoryPath, category.path);
  const isExpanded = hasChildren && isBranchExpanded(category);
  const group = document.createElement("div");
  group.className = isChild ? "sub-category-group" : "category-group";
  group.dataset.depth = String(depth);

  const title = document.createElement("button");
  title.type = "button";
  title.className = `${isChild ? "sub-category-title" : "category-title"}${isActive ? " is-active" : ""}${isExpanded ? " is-open" : ""}`;
  title.dataset.depth = String(depth);
  title.style.setProperty("--category-depth", String(depth));
  title.setAttribute("aria-expanded", String(isExpanded));
  title.innerHTML = `
    <span class="toggle-icon" aria-hidden="true">${hasChildren ? (isExpanded ? "v" : ">") : "-"}</span>
    <span class="category-title-bar" aria-hidden="true"></span>
    <span class="category-title-text">${escapeHtml(category.name)}</span>
  `;
  title.addEventListener("click", () => {
    updateCategoryBrowserState(category, els);
  });

  group.appendChild(title);
  const content = createBranchChildrenContent(category, els, isChild);
  if (content) {
    group.appendChild(content);
  }
  return group;
}

function toggleCollapse(titleNode, contentNode) {
  const isCollapsed = titleNode.classList.toggle("collapsed");
  const icon = titleNode.querySelector(".toggle-icon");
  if (icon) {
    icon.textContent = isCollapsed ? ">" : "v";
  }
  if (isCollapsed) {
    collapseContent(contentNode);
  } else {
    expandContent(contentNode);
  }
}


function expandContent(contentNode) {
  contentNode.hidden = false;
  contentNode.classList.remove("collapsed");
}


function collapseContent(contentNode) {
  contentNode.classList.add("collapsed");
  contentNode.hidden = true;
}



