// renderer.js - نسخة معدلة لحل مشكلة مسار الملفات

// [تصحيح] تم تحديث المسارات لتشير إلى مجلد 'js'
import { state, setState } from './js/state.js';
import { setupEventListeners, createNewReceipt } from './js/events.js';
import { render } from './js/ui.js';
import { showLoader, hideLoader, showNotification } from './js/utils.js';
import { cartSession } from './js/api.js';


// --- دالة بدء تشغيل التطبيق ---
async function initializeApp() {
    showLoader();
    try {
        window.api.onSetUser(user => { state.currentUser = user; });

        const initialData = await window.api.loadData();
        if (initialData && !initialData.error) {
            setState(initialData);

            const userFilter = document.getElementById('user-filter');
            if (userFilter) {
                userFilter.innerHTML = '<option value="all" data-lang-key="allUsers">All Users</option>';
                state.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.username;
                    option.textContent = user.username;
                    userFilter.appendChild(option);
                });
            }

            cartSession.load();
            if (state.receipts && state.receipts.length === 0) {
                createNewReceipt(false);
            }

        } else {
            console.error("Initialization Error:", initialData ? initialData.error : "No data returned");
            showNotification("Fatal Error: Could not load database.", "error");
            return;
        }

        setupEventListeners();
        render();

    } catch (error) {
        console.error("Initialization failed:", error);
        showNotification("Application failed to start correctly.", "error");
    } finally {
        hideLoader();
    }
}

// --- إعداد المستمع للتحديثات اللحظية ---
window.api.onFirestoreUpdate(({ collection, data }) => {
    console.log(`Renderer received update for: '${collection}'`);
    let needsUIRender = false;

    if (collection === 'app_config') {
        const configData = data.length > 0 ? data[0] : {};
        state.categories = ['All', ...(configData.categories || [])];
        state.expenses = configData.expenses || { daily: [], rent: { amount: 0, paidStatus: {} } };
        state.salaries = configData.salaries || {};
        state.salariesPaidStatus = configData.salariesPaidStatus || {};
        state.lastShiftReportTime = configData.lastShiftReportTime;
        needsUIRender = true;
    } else if (state.hasOwnProperty(collection)) {
        state[collection] = data;
        needsUIRender = true;
    }

    if (needsUIRender) {
        console.log("State updated via listener, re-rendering UI...");
        render();
    }
});

// --- بدء تشغيل التطبيق عند تحميل الصفحة ---
document.addEventListener('DOMContentLoaded', initializeApp);
