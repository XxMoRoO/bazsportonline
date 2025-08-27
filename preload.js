// preload.js - النسخة الكاملة والنهائية

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // --- عمليات البيانات الأساسية ---
    loadData: () => ipcRenderer.invoke('load-data'),
    saveData: (data) => ipcRenderer.invoke('save-data', data),

    // --- استقبال التحديثات اللحظية ---
    onFirestoreUpdate: (callback) => ipcRenderer.on('firestore-update', (event, ...args) => callback(...args)),

    // --- عمليات المصادقة وإدارة المستخدمين ---
    login: (credentials) => ipcRenderer.send('login', credentials),
    logout: () => ipcRenderer.send('logout'),
    addUser: (data) => ipcRenderer.invoke('add-user', data),
    addEmployee: (employeeData) => ipcRenderer.invoke('add-employee', employeeData),
    deleteEmployee: (data) => ipcRenderer.invoke('delete-employee', data),
    modifyEmployee: (data) => ipcRenderer.invoke('modify-employee', data),
    changeAdminPassword: (data) => ipcRenderer.invoke('change-admin-password', data),
    validateAdminPassword: (password) => ipcRenderer.invoke('validate-admin-password', password),
    changeUserPassword: (data) => ipcRenderer.invoke('change-user-password', data),

    // --- دوال النوافذ وواجهة المستخدم ---
    openUsersWindow: () => ipcRenderer.send('open-users-window'),
    getUserData: () => ipcRenderer.invoke('get-user-data'),

    // --- عمليات البيع والطباعة ---
    updateSaleCashier: (data) => ipcRenderer.invoke('update-sale-cashier', data),
    loadReceiptTemplate: () => ipcRenderer.invoke('load-receipt-template'),
    loadBookingTemplate: () => ipcRenderer.invoke('load-booking-template'),
    undoSale: (saleId) => ipcRenderer.invoke('undo-sale', saleId),


    // --- دوال اليوميات والمصاريف ---
    saveShift: (shiftData) => ipcRenderer.invoke('save-shift', shiftData),
    saveDailyExpense: (expenseData) => ipcRenderer.invoke('save-daily-expense', expenseData),
    updateDailyExpense: (expenseData) => ipcRenderer.invoke('update-daily-expense', expenseData),
    deleteDailyExpense: (expenseId) => ipcRenderer.invoke('delete-daily-expense', expenseId),
    saveShiftPDF: (data) => ipcRenderer.invoke('save-shift-pdf', data),

    // --- إدارة المخزون والتوالف ---
    addDefectiveItem: (data) => ipcRenderer.invoke('add-defective-item', data),
    reduceStockAndCost: (data) => ipcRenderer.invoke('reduce-stock-and-cost', data),
    returnDefectsToSupplier: (data) => ipcRenderer.invoke('return-defects-to-supplier', data),
    undoDefect: (defectId) => ipcRenderer.invoke('undo-defect', defectId),


    // --- إدارة الأصناف والفواتير والموردين ---
    updateCategory: (data) => ipcRenderer.invoke('update-category', data),
    updateShipmentItem: (data) => ipcRenderer.invoke('update-shipment-item', data),
    deleteShipmentItem: (data) => ipcRenderer.invoke('delete-shipment-item', data),
    splitShipment: (data) => ipcRenderer.invoke('split-shipment', data),
    mergeSelectedShipments: (data) => ipcRenderer.invoke('merge-selected-shipments', data),
    deleteSelectedShipments: (data) => ipcRenderer.invoke('delete-selected-shipments', data),
    saveNewInvoice: (data) => ipcRenderer.invoke('save-new-invoice', data),
    // [*** إضافة ***] دالة جديدة لحذف دفعة مورد
    deleteSupplierPayment: (data) => ipcRenderer.invoke('delete-supplier-payment', data),


    // --- النسخ الاحتياطي والاستعادة (الآن للسحابة) ---
    backupDatabase: () => ipcRenderer.invoke('backup-database'),
    restoreDatabase: () => ipcRenderer.invoke('restore-database'),

    // --- مستمعو الأحداث من الخلفية ---
    onLoginFailed: (callback) => ipcRenderer.on('login-failed', callback),
    onSetUser: (callback) => ipcRenderer.on('set-user', (event, user) => callback(user)),
});
