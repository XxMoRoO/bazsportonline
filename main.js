// main.js - النسخة النهائية (مع كل الوظائف مدمجة وإصلاح الأخطاء)

const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// --- إضافة Firebase ---
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, getDocs, getDoc, setDoc, writeBatch, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, runTransaction } = require("firebase/firestore");
const { getStorage, ref, uploadString, getDownloadURL } = require("firebase/storage");

const firebaseConfig = {
    apiKey: "AIzaSyDsGsS6CbEqUBqmW1-VIVm81QnP941UuFo",
    authDomain: "baz-sport-store.firebaseapp.com",
    projectId: "baz-sport-store",
    storageBucket: "baz-sport-store.appspot.com",
    messagingSenderId: "279577862201",
    appId: "1:279577862201:web:612231c9d1706975666de8",
    measurementId: "G-BRTSMVXB32"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
// --- نهاية إضافة Firebase ---

let mainWindow;
let usersWindow = null;
let loggedInUser = null;
let realtimeListeners = [];

const iconPath = path.join(__dirname, 'build', 'icon.ico');

// --- دالة إنشاء المستخدم الافتراضي ---
async function ensureSuperUserExists() {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    if (snapshot.empty) {
        console.log("No users found. Creating default superuser...");
        try {
            const batch = writeBatch(db);
            const superUser = {
                username: "BAZ",
                username_lowercase: "baz",
                password: "admin123",
                employeeId: "SUPERUSER",
                phone: ""
            };
            const userRef = doc(collection(db, "users"));
            batch.set(userRef, superUser);

            const configRef = doc(db, "app_config", "main");
            const configData = {
                adminPassword: "admin123", categories: [],
                salaries: { "BAZ": { fixed: 0, commission: 0, bonus: 0 } },
                salariesPaidStatus: {},
                expenses: { rent: { amount: 0, paidStatus: {} } },
                lastShiftReportTime: null
            };
            batch.set(configRef, configData);

            await batch.commit();
            dialog.showMessageBox({
                type: 'info', title: 'First Time Setup',
                message: 'A default superuser has been created.\n\nUsername: BAZ\nPassword: admin123'
            });
        } catch (error) {
            console.error("Failed to create superuser:", error);
        }
    }
}

// --- دوال إنشاء النوافذ ---
function createLoginWindow() {
    const loginWindow = new BrowserWindow({
        width: 400, height: 750,
        webPreferences: { preload: path.join(__dirname, 'preload.js') },
        resizable: false, icon: iconPath
    });
    loginWindow.loadFile(path.join(__dirname, 'login.html'));
}

function createMainWindow(user) {
    mainWindow = new BrowserWindow({
        fullscreen: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), webSecurity: false },
        icon: iconPath
    });

    // [*** تعديل ***] إنشاء قائمة علوية مخصصة
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Quit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.webContents.on('did-finish-load', () => {
        // [*** تعديل ***] إرسال حالة الأدمن عند تحميل الصفحة
        const isAdmin = user.username === 'BAZ';
        mainWindow.webContents.send('set-user', { username: user.username, isAdmin: isAdmin });
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F5') {
            mainWindow.webContents.reload();
            event.preventDefault();
        }
        if (input.key === 'F7') {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.focus();
            }
            mainWindow.webContents.send('focus-search');
            event.preventDefault();
        }
        if (input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    setupRealtimeListeners(mainWindow);

    mainWindow.on('closed', () => {
        cleanupListeners();
        mainWindow = null;
    });
}

function createUsersWindow() {
    if (usersWindow && !usersWindow.isDestroyed()) {
        usersWindow.focus(); return;
    }
    usersWindow = new BrowserWindow({
        width: 500, height: 600,
        webPreferences: { preload: path.join(__dirname, 'preload.js') },
        parent: mainWindow, modal: true, icon: iconPath, title: 'User Management'
    });
    usersWindow.loadFile(path.join(__dirname, 'users.html'));
    usersWindow.setMenu(null);
    usersWindow.on('closed', () => { usersWindow = null; });
}

// --- دوال التعامل مع Firestore ---
function setupRealtimeListeners(window) {
    cleanupListeners();

    const collectionsToWatch = ['products', 'sales', 'customers', 'bookings', 'defects', 'suppliers', 'shipments', 'shifts', 'users', 'daily_expenses'];
    collectionsToWatch.forEach(collName => {
        const unsubscribe = onSnapshot(collection(db, collName), (snapshot) => {
            if (window && !window.isDestroyed()) {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                window.webContents.send('firestore-update', { collection: collName, data });
            }
        });
        realtimeListeners.push(unsubscribe);
    });

    const unsubscribeConfig = onSnapshot(doc(db, "app_config", "main"), (doc) => {
        if (window && !window.isDestroyed()) {
            if (doc.exists()) {
                const data = [{ id: doc.id, ...doc.data() }];
                window.webContents.send('firestore-update', { collection: 'app_config', data });
            }
        }
    });
    realtimeListeners.push(unsubscribeConfig);
}

function cleanupListeners() {
    realtimeListeners.forEach(unsubscribe => unsubscribe());
    realtimeListeners = [];
}

// --- معالجات IPC (تمت إضافة كل الوظائف الناقصة) ---

ipcMain.handle('load-data', async () => {
    try {
        const collections = ['products', 'sales', 'customers', 'bookings', 'defects', 'suppliers', 'shipments', 'shifts', 'users', 'daily_expenses'];
        const data = {};
        for (const coll of collections) {
            const snapshot = await getDocs(collection(db, coll));
            data[coll] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        const configDoc = await getDoc(doc(db, "app_config", "main"));
        if (configDoc.exists()) {
            data.config = configDoc.data();
            data.categories = data.config.categories || [];
            data.salaries = data.config.salaries || {};
            data.salariesPaidStatus = data.config.salariesPaidStatus || {};
            data.expenses = {
                rent: data.config.expenses?.rent || { amount: 0, paidStatus: {} },
                daily: data.daily_expenses || []
            };
        } else {
            data.config = { adminPassword: 'admin123' };
            data.expenses = { rent: { amount: 0, paidStatus: {} }, daily: [] };
        }
        return data;
    } catch (error) {
        console.error("Error loading data:", error);
        return { error: error.message };
    }
});

ipcMain.handle('save-data', async (event, dataToSave) => {
    const batch = writeBatch(db);
    try {
        const { products, sales, categories, customers, bookings, salaries, salariesPaidStatus, expenses, defects, suppliers, shipments, shifts, users } = dataToSave;

        const configRef = doc(db, "app_config", "main");
        const configDoc = await getDoc(configRef);
        const currentConfig = configDoc.exists() ? configDoc.data() : {};
        batch.set(configRef, { ...currentConfig, categories, salaries, salariesPaidStatus, expenses: { rent: expenses.rent } }, { merge: true });

        const collections = { products, sales, customers, bookings, defects, suppliers, shipments, shifts, users, daily_expenses: expenses.daily };
        for (const [collName, collData] of Object.entries(collections)) {
            if (collData) {
                const snapshot = await getDocs(collection(db, collName));
                const existingIds = new Set(snapshot.docs.map(d => d.id));

                collData.forEach(item => {
                    const docRef = item.id ? doc(db, collName, item.id) : doc(collection(db, collName));
                    batch.set(docRef, item);
                    if (item.id) existingIds.delete(item.id);
                });

                existingIds.forEach(idToDelete => {
                    batch.delete(doc(db, collName, idToDelete));
                });
            }
        }
        await batch.commit();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.on('login', async (event, credentials) => {
    const { username, password } = credentials;
    const q = query(collection(db, "users"), where("username_lowercase", "==", username.toLowerCase()), where("password", "==", password));
    try {
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            loggedInUser = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            createMainWindow(loggedInUser);
            BrowserWindow.fromWebContents(event.sender).close();
        } else {
            event.sender.send('login-failed', 'Incorrect username or password.');
        }
    } catch (error) {
        event.sender.send('login-failed', 'An error occurred.');
    }
});

ipcMain.on('logout', () => {
    if (mainWindow) {
        mainWindow.close();
    }
    createLoginWindow();
});

ipcMain.on('open-users-window', createUsersWindow);

ipcMain.handle('validate-admin-password', async (event, password) => {
    const configDoc = await getDoc(doc(db, "app_config", "main"));
    return { success: configDoc.exists() && password === configDoc.data().adminPassword };
});

ipcMain.handle('change-admin-password', async (event, data) => {
    const { oldPassword, newPassword } = data;
    const configRef = doc(db, "app_config", "main");
    const configDoc = await getDoc(configRef);

    if (!configDoc.exists() || oldPassword !== configDoc.data().adminPassword) {
        return { success: false, message: 'Incorrect old admin password.' };
    }

    await updateDoc(configRef, { adminPassword: newPassword });

    const q = query(collection(db, "users"), where("username", "==", "BAZ"));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const userId = snapshot.docs[0].id;
        await updateDoc(doc(db, "users", userId), { password: newPassword });
    }

    return { success: true };
});

ipcMain.handle('add-employee', async (event, employeeData) => {
    try {
        const usersRef = collection(db, "users");
        const userQuery = await getDocs(query(usersRef, where("username_lowercase", "==", employeeData.username.toLowerCase())));
        if (!userQuery.empty) return { success: false, message: 'Username already exists.' };

        const empQuery = await getDocs(query(usersRef, where("employeeId", "==", employeeData.employeeId)));
        if (!empQuery.empty && employeeData.employeeId) return { success: false, message: 'Employee ID already exists.' };

        await addDoc(usersRef, { ...employeeData, username_lowercase: employeeData.username.toLowerCase(), password: '' });

        const configRef = doc(db, "app_config", "main");
        const configDoc = await getDoc(configRef);
        const salaries = configDoc.exists() ? configDoc.data().salaries : {};
        salaries[employeeData.username] = { fixed: 0, commission: 0, bonus: 0 };
        await updateDoc(configRef, { salaries });

        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('save-shift-pdf', async (event, { pdfData, fileName }) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Shift Report',
            defaultPath: path.join(app.getPath('documents'), fileName),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (filePath) {
            fs.writeFileSync(filePath, pdfData);
            return { success: true, path: filePath };
        }
        return { success: false, message: 'Save cancelled.' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-receipt-template', async () => {
    try {
        const templatePath = path.join(__dirname, 'receipt.html');
        const logoPath = path.join(__dirname, 'build', 'logo.png');
        const template = fs.readFileSync(templatePath, 'utf-8');
        const logoBase64 = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath, 'base64')}` : null;
        return { template, logoBase64 };
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('load-booking-template', async () => {
    try {
        const templatePath = path.join(__dirname, 'booking-receipt.html');
        const logoPath = path.join(__dirname, 'build', 'logo.png');
        const template = fs.readFileSync(templatePath, 'utf-8');
        const logoBase64 = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath, 'base64')}` : null;
        return { template, logoBase64 };
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('delete-daily-expense', async (event, expenseId) => {
    try {
        await deleteDoc(doc(db, "daily_expenses", expenseId));
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('update-daily-expense', async (event, expenseData) => {
    try {
        const { id, ...dataToUpdate } = expenseData;
        await updateDoc(doc(db, "daily_expenses", id), dataToUpdate);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('merge-selected-shipments', async (event, { supplierId, shipmentIds }) => {
    if (shipmentIds.length < 2) return { success: false, message: 'Select at least two invoices.' };
    const batch = writeBatch(db);
    try {
        const shipmentsRefs = shipmentIds.map(id => doc(db, "shipments", id));
        const shipmentDocs = await Promise.all(shipmentsRefs.map(ref => getDoc(ref)));

        const shipments = shipmentDocs.map(d => d.data());
        const primaryShipment = shipments.shift();
        const primaryShipmentRef = shipmentDocs.shift().ref;

        shipments.forEach((shipmentToMerge, index) => {
            primaryShipment.items.push(...shipmentToMerge.items);
            primaryShipment.totalCost += shipmentToMerge.totalCost;
            primaryShipment.shippingCost += shipmentToMerge.shippingCost;
            batch.delete(shipmentDocs[index].ref);
        });

        batch.update(primaryShipmentRef, primaryShipment);
        await batch.commit();
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-selected-shipments', async (event, { shipmentIds }) => {
    const batch = writeBatch(db);
    const deletedData = { shipments: [], defects: [] };
    try {
        for (const shipmentId of shipmentIds) {
            const shipmentRef = doc(db, "shipments", shipmentId);
            const shipmentDoc = await getDoc(shipmentRef);
            if (shipmentDoc.exists()) {
                const shipment = shipmentDoc.data();
                deletedData.shipments.push(shipment);

                for (const item of shipment.items) {
                    const productRef = doc(db, "products", item.productId);
                    const productDoc = await getDoc(productRef);
                    if (productDoc.exists()) {
                        const product = productDoc.data();
                        const currentQty = product.colors?.[item.color]?.sizes?.[item.size]?.quantity || 0;
                        const path = `colors.${item.color}.sizes.${item.size}.quantity`;
                        batch.update(productRef, { [path]: Math.max(0, currentQty - item.quantity) });
                    }
                }
                batch.delete(shipmentRef);
            }
        }
        await batch.commit();
        return { success: true, deletedData };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-shipment-item', async (event, { shipmentId, itemIndex }) => {
    const batch = writeBatch(db);
    try {
        const shipmentRef = doc(db, "shipments", shipmentId);
        const shipmentDoc = await getDoc(shipmentRef);
        if (shipmentDoc.exists()) {
            const shipment = shipmentDoc.data();
            const itemToDelete = shipment.items[itemIndex];

            const productRef = doc(db, "products", itemToDelete.productId);
            const productDoc = await getDoc(productRef);
            if (productDoc.exists()) {
                const product = productDoc.data();
                const currentQty = product.colors?.[itemToDelete.color]?.sizes?.[itemToDelete.size]?.quantity || 0;
                const path = `colors.${itemToDelete.color}.sizes.${itemToDelete.size}.quantity`;
                batch.update(productRef, { [path]: Math.max(0, currentQty - itemToDelete.quantity) });
            }

            shipment.totalCost -= (itemToDelete.quantity * itemToDelete.purchasePrice);
            shipment.items.splice(itemIndex, 1);
            batch.update(shipmentRef, { items: shipment.items, totalCost: shipment.totalCost });

            await batch.commit();
            return { success: true };
        }
        return { success: false, message: 'Shipment not found.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('split-shipment', async (event, { sourceShipmentId, itemIndices }) => {
    const batch = writeBatch(db);
    try {
        const sourceShipmentRef = doc(db, "shipments", sourceShipmentId);
        const sourceShipmentDoc = await getDoc(sourceShipmentRef);
        if (!sourceShipmentDoc.exists()) {
            return { success: false, message: "Source shipment not found." };
        }

        const sourceShipment = sourceShipmentDoc.data();
        const itemsToMove = [];
        const remainingItems = [];

        sourceShipment.items.forEach((item, index) => {
            if (itemIndices.includes(index)) {
                itemsToMove.push(item);
            } else {
                remainingItems.push(item);
            }
        });

        const newShipmentId = `SH${sourceShipment.date.replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;
        const newShipment = {
            id: newShipmentId,
            supplierId: sourceShipment.supplierId,
            date: sourceShipment.date,
            items: itemsToMove,
            totalCost: itemsToMove.reduce((sum, item) => sum + (item.quantity * item.purchasePrice), 0),
            shippingCost: 0
        };

        sourceShipment.items = remainingItems;
        sourceShipment.totalCost = remainingItems.reduce((sum, item) => sum + (item.quantity * item.purchasePrice), 0);

        batch.update(sourceShipmentRef, sourceShipment);
        batch.set(doc(db, "shipments", newShipmentId), newShipment);

        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Split shipment error:", error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('add-defective-item', async (event, defectData) => {
    try {
        const newDefectRef = doc(collection(db, "defects")); // Generate ref beforehand to get the ID

        await runTransaction(db, async (transaction) => {
            const productRef = doc(db, "products", defectData.productId);
            const productDoc = await transaction.get(productRef);

            if (!productDoc.exists()) {
                throw new Error(`Product with ID ${defectData.productId} not found.`);
            }

            const product = productDoc.data();
            const currentQty = product.colors?.[defectData.color]?.sizes?.[defectData.size]?.quantity || 0;

            if (defectData.quantity > currentQty) {
                throw new Error(`Cannot mark ${defectData.quantity} as defective. Only ${currentQty} in stock.`);
            }

            const path = `colors.${defectData.color}.sizes.${defectData.size}.quantity`;
            transaction.update(productRef, { [path]: currentQty - defectData.quantity });

            const dataToSave = {
                ...defectData,
                id: newDefectRef.id, // Store the ID inside the document itself
                status: 'active',
                returnedQty: 0,
                returnPaymentId: null // To link the defect to the specific payment
            };
            transaction.set(newDefectRef, dataToSave);
        });

        return { success: true, newDefectId: newDefectRef.id }; // Return the new ID
    } catch (error) {
        console.error("Error adding defective item:", error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('return-defects-to-supplier', async (event, { supplierId, returns }) => {
    try {
        await runTransaction(db, async (transaction) => {
            let totalReturnValue = 0;
            const supplierRef = doc(db, "suppliers", supplierId);

            const supplierDoc = await transaction.get(supplierRef);
            if (!supplierDoc.exists()) {
                throw new Error("Supplier not found.");
            }

            const paymentId = `RET-${Date.now()}`; // Create a single payment ID for this transaction

            for (const ret of returns) {
                const defectRef = doc(db, "defects", ret.defectId);
                const defectDoc = await transaction.get(defectRef);

                if (!defectDoc.exists()) {
                    throw new Error(`Item with ID ${ret.defectId} could not be found. The return process has been cancelled.`);
                }

                const defect = defectDoc.data();

                if (defect.status === 'undone') {
                    throw new Error(`Item "${defect.productName}" cannot be returned because it has been returned to stock.`);
                }

                const quantityToReturn = ret.quantity;
                const unreturnedQty = defect.quantity - (defect.returnedQty || 0);

                if (quantityToReturn > unreturnedQty) {
                    throw new Error(`Cannot return ${quantityToReturn} for defect ${defect.productName}. Only ${unreturnedQty} are unreturned.`);
                }

                const currentReturnedQty = defect.returnedQty || 0;
                // Link this specific return to the payment ID
                transaction.update(defectRef, {
                    returnedQty: currentReturnedQty + quantityToReturn,
                    returnPaymentId: paymentId
                });

                const purchasePrice = Number(defect.purchasePrice);
                if (isNaN(purchasePrice) || purchasePrice <= 0) {
                    throw new Error(`Defective item "${defect.productName} (${defect.color}/${defect.size})" has an invalid or missing purchase price. Cannot process return.`);
                }
                totalReturnValue += quantityToReturn * purchasePrice;
            }

            if (totalReturnValue > 0) {
                const supplier = supplierDoc.data();
                const payments = supplier.payments || [];
                payments.push({
                    id: paymentId,
                    date: new Date().toISOString(),
                    amount: -totalReturnValue,
                    type: 'return'
                });
                transaction.update(supplierRef, { payments });
            }
        });

        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (senderWindow) {
            senderWindow.reload();
        }

        return { success: true };
    } catch (error) {
        console.error("Error returning defects to supplier:", error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-supplier-payment', async (event, { supplierId, paymentId }) => {
    if (!supplierId || !paymentId) {
        return { success: false, message: 'Supplier ID and Payment ID are required.' };
    }

    try {
        await runTransaction(db, async (transaction) => {
            const supplierRef = doc(db, "suppliers", supplierId);
            const supplierDoc = await transaction.get(supplierRef);

            if (!supplierDoc.exists()) {
                throw new Error("Supplier not found.");
            }

            const supplier = supplierDoc.data();
            const initialPaymentsCount = supplier.payments?.length || 0;

            const updatedPayments = (supplier.payments || []).filter(p => p.id !== paymentId);

            if (updatedPayments.length === initialPaymentsCount) {
                console.warn(`Payment with ID ${paymentId} not found for supplier ${supplierId}. No changes made.`);
                return;
            }

            transaction.update(supplierRef, { payments: updatedPayments });
        });

        return { success: true };
    } catch (error) {
        console.error(`Error deleting payment ${paymentId} for supplier ${supplierId}:`, error);
        return { success: false, message: error.message };
    }
});


ipcMain.handle('reduce-stock-and-cost', async (event, { productId, color, size, reductionAmount }) => {
    const batch = writeBatch(db);
    try {
        const productRef = doc(db, "products", productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
            const product = productDoc.data();
            const currentQty = product.colors?.[color]?.sizes?.[size]?.quantity || 0;
            const path = `colors.${color}.sizes.${size}.quantity`;
            batch.update(productRef, { [path]: Math.max(0, currentQty - reductionAmount) });
            await batch.commit();
            return { success: true };
        }
        return { success: false, message: 'Product not found.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('save-shift', async (event, shiftData) => {
    await addDoc(collection(db, "shifts"), shiftData);
    await setDoc(doc(db, "app_config", "main"), { lastShiftReportTime: shiftData.endedAt }, { merge: true });
    return { success: true };
});

ipcMain.handle('save-daily-expense', async (event, expenseData) => {
    try {
        await addDoc(collection(db, "daily_expenses"), expenseData);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('save-new-invoice', async (event, invoiceData) => {
    const { supplierId, date, shippingCost, items } = invoiceData;
    try {
        const shipmentId = `SH${date.replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;
        const newShipment = { id: shipmentId, supplierId, date, shippingCost, items: [], totalCost: 0 };
        let totalInvoiceCost = 0;

        await runTransaction(db, async (transaction) => {
            for (const item of items) {
                const productRef = doc(db, 'products', item.productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) {
                    throw new Error(`Product with ID ${item.productId} not found.`);
                }
                const productData = productDoc.data();

                for (const [color, sizes] of Object.entries(item.quantities)) {
                    for (const [size, quantity] of Object.entries(sizes)) {
                        if (quantity > 0) {
                            const currentQty = productData.colors?.[color]?.sizes?.[size]?.quantity || 0;
                            const newQty = currentQty + quantity;
                            const fieldPath = `colors.${color}.sizes.${size}.quantity`;
                            transaction.update(productRef, { [fieldPath]: newQty });

                            totalInvoiceCost += quantity * productData.purchasePrice;

                            newShipment.items.push({
                                productId: item.productId,
                                productName: productData.name,
                                color: color,
                                size: size,
                                quantity: quantity,
                                purchasePrice: productData.purchasePrice
                            });
                        }
                    }
                }
            }
            newShipment.totalCost = totalInvoiceCost;
            const shipmentRef = doc(db, 'shipments', shipmentId);
            transaction.set(shipmentRef, newShipment);
        });

        return { success: true, id: shipmentId };
    } catch (error) {
        console.error("Error saving invoice:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('undo-sale', async (event, saleId) => {
    if (!saleId) {
        return { success: false, message: 'Sale ID is required.' };
    }

    try {
        await runTransaction(db, async (transaction) => {
            const saleRef = doc(db, "sales", saleId);
            const saleDoc = await transaction.get(saleRef);

            if (!saleDoc.exists()) {
                throw new Error("Sale not found.");
            }

            const sale = saleDoc.data();
            if (sale.status === 'returned') {
                throw new Error("This sale has already been returned.");
            }

            for (const item of sale.items) {
                const productRef = doc(db, "products", item.id);
                const productDoc = await transaction.get(productRef);

                if (productDoc.exists()) {
                    const product = productDoc.data();
                    const currentQty = product.colors?.[item.color]?.sizes?.[item.size]?.quantity || 0;
                    const fieldPath = `colors.${item.color}.sizes.${item.size}.quantity`;
                    transaction.update(productRef, { [fieldPath]: currentQty + item.quantity });
                } else {
                    console.warn(`Product with ID ${item.id} from sale ${saleId} not found. Stock not restored for this item.`);
                }
            }

            transaction.update(saleRef, {
                status: 'returned',
                returnedAt: new Date().toISOString(),
                returnedBy: loggedInUser ? loggedInUser.username : 'Unknown'
            });
        });

        return { success: true, saleId: saleId };
    } catch (error) {
        console.error(`Error undoing sale ${saleId}:`, error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('undo-defect', async (event, defectId) => {
    try {
        await runTransaction(db, async (transaction) => {
            const defectRef = doc(db, "defects", defectId);
            const defectDoc = await transaction.get(defectRef);

            if (!defectDoc.exists()) {
                throw new Error("Defect entry not found.");
            }
            const defect = defectDoc.data();

            if (defect.status === 'undone') {
                throw new Error("This action has already been undone.");
            }

            // 1. Restore product stock
            const productRef = doc(db, "products", defect.productId);
            const productDoc = await transaction.get(productRef);
            if (productDoc.exists()) {
                const product = productDoc.data();
                const currentQty = product.colors?.[defect.color]?.sizes?.[defect.size]?.quantity || 0;
                const fieldPath = `colors.${defect.color}.sizes.${defect.size}.quantity`;
                transaction.update(productRef, { [fieldPath]: currentQty + defect.quantity });
            } else {
                console.warn(`Product ${defect.productId} not found for defect undo. Stock not restored.`);
            }

            // 2. [*** تعديل رئيسي ***] حذف معاملة المرتجع الأصلية من سجل المورد
            const paymentIdToDelete = defect.returnPaymentId;
            if (paymentIdToDelete && defect.supplierId) {
                const supplierRef = doc(db, "suppliers", defect.supplierId);
                const supplierDoc = await transaction.get(supplierRef);
                if (supplierDoc.exists()) {
                    const supplier = supplierDoc.data();
                    const updatedPayments = (supplier.payments || []).filter(p => p.id !== paymentIdToDelete);
                    transaction.update(supplierRef, { payments: updatedPayments });
                }
            }

            // 3. تحديث حالة التالف بدلاً من حذفه
            transaction.update(defectRef, {
                status: 'undone',
                returnedQty: 0,
                returnPaymentId: null // Clear the link
            });
        });

        return { success: true };
    } catch (error) {
        console.error("Error undoing defect:", error);
        return { success: false, message: error.message };
    }
});


ipcMain.handle('upload-image', async (event, { base64, fileName }) => {
    try {
        const storageRef = ref(storage, `product_images/${fileName}`);
        const snapshot = await uploadString(storageRef, base64, 'data_url');
        const downloadURL = await getDownloadURL(snapshot.ref);
        return { success: true, url: downloadURL };
    } catch (error) {
        console.error("Image upload failed:", error);
        return { success: false, error: error.message };
    }
});

// --- App Lifecycle ---
app.whenReady().then(async () => {
    await ensureSuperUserExists();
    createLoginWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
});
