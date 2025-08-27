/**
 * js/api.js
 * * يحتوي هذا الملف على جميع الدوال التي تتفاعل مع الواجهة الخلفية (Main Process)
 * عبر `window.api`، بالإضافة إلى دوال الطباعة والتصدير.
 */

import { state, translations } from './state.js';
import { showLoader, hideLoader, showNotification, getProductTotalQuantity } from './utils.js';
// لا نستورد createNewReceipt هنا لتجنب الاعتماد الدائري

// --- حفظ البيانات ---
// [--- تعديل ---] تم تحديث الدالة لتشمل اليوميات
export async function saveData() {
    showLoader();
    try {
        const savedCategories = state.categories.filter(c => c !== 'All');
        const result = await window.api.saveData({
            products: state.products,
            sales: state.sales,
            categories: savedCategories,
            customers: state.customers,
            bookings: state.bookings,
            salaries: state.salaries,
            salariesPaidStatus: state.salariesPaidStatus,
            expenses: state.expenses,
            defects: state.defects,
            suppliers: state.suppliers,
            shipments: state.shipments,
            shifts: state.shifts, // [--- إضافة ---]
        });
        if (!result.success) {
            console.error("Failed to save data:", result.error);
            showNotification("Error: Could not save data.", 'error');
        }
    } finally {
        hideLoader();
    }
}

// [--- إضافة ---] دوال جديدة لتعديل وحذف المصاريف اليومية
export async function updateDailyExpense(expenseData) {
    return await window.api.updateDailyExpense(expenseData);
}

export async function deleteDailyExpense(expenseId) {
    return await window.api.deleteDailyExpense(expenseId);
}


export const cartSession = {
    save: () => sessionStorage.setItem('bags-receipts', JSON.stringify(state.receipts)),
    load: () => {
        const savedReceipts = sessionStorage.getItem('bags-receipts');
        if (savedReceipts) {
            try {
                state.receipts = JSON.parse(savedReceipts);
                state.receipts.forEach(receipt => {
                    if (receipt.seller === undefined) {
                        receipt.seller = '';
                    }
                });
                state.activeReceiptId = state.receipts[0]?.id || null;
            } catch (e) {
                console.error("Could not parse saved receipts:", e);
                state.receipts = [];
                state.activeReceiptId = null;
            }
        } else {
            state.receipts = [];
            state.activeReceiptId = null;
        }
    }
};

// --- دوال الطباعة والتصدير ---
export function printBarcode(barcodeValue, productName, color, size, price) {
    if (!barcodeValue) {
        console.warn('Attempted to print barcode for a product without one.');
        showNotification("This item does not have a barcode.", "error");
        return;
    }

    const printWindow = window.open('', 'PRINT', 'height=150,width=300');

    printWindow.document.write(`
        <html>
            <head>
                <title>Print Barcode</title>
                <style>
                    body { 
                        text-align: center; 
                        margin: 0; 
                        padding: 5px; 
                        font-family: Arial, sans-serif; 
                        width: 58mm; 
                        box-sizing: border-box; 
                    }
                    .store-name {
                        font-size: 14px;
                        font-weight: bold;
                        margin: 0;
                    }
                    .product-name {
                        font-size: 11px;
                        margin: 2px 0;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .details {
                        font-size: 10px;
                        margin-top: 2px;
                    }
                    svg { 
                        width: 100%; 
                        height: 40px; /* Fixed height for barcode */
                    }
                    @page { 
                        size: 58mm 30mm; 
                        margin: 0; 
                    }
                </style>
            </head>
            <body>
                <p class="store-name">Baz Sport</p>
                <p class="product-name">${productName}</p>
                <svg id="barcode"></svg>
                <p class="details">${price} EGP - ${color} / ${size}</p>
                <script src="./libs/jsbarcode.all.min.js"><\/script>
                <script>
                    window.onload = function() {
                        try {
                            JsBarcode("#barcode", "${barcodeValue}", {
                                format: "CODE128", 
                                width: 1.5, 
                                height: 35, 
                                displayValue: true, 
                                fontSize: 12, 
                                textMargin: 0, 
                                margin: 2
                            });
                            window.print();
                        } catch (e) { console.error('JsBarcode Error:', e); }
                        setTimeout(() => window.close(), 500);
                    };
                <\/script>
            </body>
        </html>`);
    printWindow.document.close();
}


export async function printReceipt(saleId) {
    showLoader();
    try {
        const sale = state.sales.find(s => s.id === saleId);
        if (!sale) {
            showNotification(`Receipt with ID ${saleId} not found.`, 'error');
            return;
        }

        const receiptData = await window.api.loadReceiptTemplate();
        if (!receiptData || receiptData.error) {
            console.error("Failed to load receipt template:", receiptData.error);
            showNotification("Error: Could not load receipt template.", 'error');
            return;
        }

        let { template, logoBase64 } = receiptData;

        const hasReturns = sale.items.some(item => (item.returnedQty || 0) > 0);
        let itemsHtml = sale.items.map(item => `<tr><td>${item.productName} (${item.color}/${item.size})</td><td>${item.quantity}</td><td>${item.unitPrice.toFixed(2)}</td><td>${(item.unitPrice * item.quantity).toFixed(2)}</td></tr>`).join('');

        let returnsSectionHtml = '';
        let totalReturnsValue = 0;
        let displayPaidAmount = sale.paidAmount.toFixed(2);
        const finalTotal = sale.totalAmount + (sale.deliveryFee || 0);
        let displayChangeAmount = (sale.paidAmount - (finalTotal - (sale.depositPaidOnBooking || 0))).toFixed(2);

        let customerInfoHtml = '';
        if (sale.customerName) {
            customerInfoHtml = `
                <div class="customer-info">
                    <p><strong>Customer:</strong> ${sale.customerName}</p>
                    ${sale.customerPhone ? `<p><strong>Phone:</strong> ${sale.customerPhone}</p>` : ''}
                    ${sale.customerAddress ? `<p><strong>Address:</strong> ${sale.customerAddress}</p>` : ''}
                    ${sale.customerCity ? `<p><strong>City:</strong> ${sale.customerCity}</p>` : ''}
                </div>
            `;
        }


        if (hasReturns) {
            let returnedItemsHtml = '';
            let totalReturnedRawValue = 0;
            sale.items.forEach(item => {
                if ((item.returnedQty || 0) > 0) {
                    const returnedValue = item.unitPrice * item.returnedQty;
                    totalReturnedRawValue += returnedValue;
                    returnedItemsHtml += `<tr><td>${item.productName} (${item.color}/${item.size})</td><td>${item.returnedQty}</td><td>${item.unitPrice.toFixed(2)}</td><td>${returnedValue.toFixed(2)}</td></tr>`;
                }
            });
            const discountRatio = sale.subtotal > 0 ? sale.discountAmount / sale.subtotal : 0;
            totalReturnsValue = totalReturnedRawValue - (totalReturnedRawValue * discountRatio);
            returnsSectionHtml = `<h2>المرتجعات / Returns</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${returnedItemsHtml}</tbody></table>`;

            displayPaidAmount = '0.00';
            displayChangeAmount = totalReturnsValue.toFixed(2);
        }

        let finalTotalDisplayHtml;
        if (sale.depositPaidOnBooking > 0) {
            const amountRemaining = finalTotal - sale.depositPaidOnBooking;
            finalTotalDisplayHtml = `
                <p><strong>${translations[state.lang].total}:</strong> ${finalTotal.toFixed(2)} EGP</p>
                <p><strong>${translations[state.lang].depositPaid}:</strong> ${sale.depositPaidOnBooking.toFixed(2)} EGP</p>
                <p class="font-bold text-lg" style="color: var(--accent-color);">${translations[state.lang].amountRemaining}: ${Math.max(0, amountRemaining).toFixed(2)} EGP</p>
            `;
        } else {
            finalTotalDisplayHtml = `<p><strong>${translations[state.lang].total}:</strong> ${finalTotal.toFixed(2)} EGP</p>`;
        }


        template = template.replace('{{saleDate}}', new Date(sale.createdAt).toLocaleString())
            .replace('{{saleId}}', sale.id)
            .replace('{{username}}', sale.cashier || 'N/A')
            .replace('{{customerInfo}}', customerInfoHtml)
            .replace('{{itemsHtml}}', itemsHtml)
            .replace('{{returnsSection}}', returnsSectionHtml)
            .replace('{{subtotal}}', sale.subtotal.toFixed(2))
            .replace('{{discountAmount}}', sale.discountAmount.toFixed(2))
            .replace('{{totalReturns}}', totalReturnsValue.toFixed(2))
            .replace('{{deliveryFee}}', (sale.deliveryFee || 0).toFixed(2))
            .replace('{{paidAmount}}', displayPaidAmount)
            .replace('{{changeAmount}}', displayChangeAmount)
            .replace('{{logoSrc}}', logoBase64 || '');

        template = template.replace(
            `<div id="final-total-section"></div>`,
            finalTotalDisplayHtml
        );


        const receiptWindow = window.open('', 'PRINT', 'height=800,width=400');
        receiptWindow.document.write(template);
        receiptWindow.document.close();
        setTimeout(() => {
            receiptWindow.focus();
            receiptWindow.print();
            setTimeout(() => receiptWindow.close(), 1000);
        }, 500);
    } catch (error) {
        console.error("Error printing receipt:", error);
        showNotification("An error occurred while printing the receipt.", "error");
    } finally {
        hideLoader();
    }
}

export async function printBooking(bookingId) {
    showLoader();
    try {
        const booking = state.bookings.find(b => b.id === bookingId);
        if (!booking) {
            showNotification(`Booking with ID ${bookingId} not found.`, 'error');
            return;
        }

        const bookingData = await window.api.loadBookingTemplate();
        if (!bookingData || bookingData.error) {
            console.error("Failed to load booking template:", bookingData.error);
            showNotification("Error: Could not load booking template.", 'error');
            return;
        }

        let { template, logoBase64 } = bookingData;

        let itemsHtml = booking.cart.map(item => `<tr><td>${item.productName} (${item.color}/${item.size})</td><td>${item.quantity}</td><td>${item.price.toFixed(2)}</td><td>${(item.price * item.quantity).toFixed(2)}</td></tr>`).join('');

        const subtotal = booking.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const amountDue = subtotal - booking.deposit;

        const depositMethodPrint = booking.depositPaymentMethod ? ` (${translations[state.lang][booking.depositPaymentMethod] || booking.depositPaymentMethod})` : '';

        template = template.replace('{{bookingDate}}', new Date(booking.createdAt).toLocaleString())
            .replace('{{bookingId}}', booking.id)
            .replace('{{username}}', booking.seller || 'N/A')
            .replace('{{customerName}}', booking.customerName || 'N/A')
            .replace('{{customerPhone}}', booking.customerPhone || 'N/A')
            .replace('{{customerAddress}}', booking.customerAddress || 'N/A')
            .replace('{{customerCity}}', booking.customerCity || 'N/A')
            .replace('{{itemsHtml}}', itemsHtml)
            .replace('{{subtotal}}', subtotal.toFixed(2))
            .replace('{{deposit}}', booking.deposit.toFixed(2) + depositMethodPrint)
            .replace('{{amountDue}}', amountDue.toFixed(2))
            .replace('{{logoSrc}}', logoBase64 || '');

        const bookingWindow = window.open('', 'PRINT', 'height=800,width=400');
        bookingWindow.document.write(template);
        bookingWindow.document.close();
        setTimeout(() => {
            bookingWindow.focus();
            bookingWindow.print();
            setTimeout(() => bookingWindow.close(), 1000);
        }, 500);
    } catch (error) {
        console.error("Error printing booking:", error);
        showNotification("An error occurred while printing the booking.", "error");
    } finally {
        hideLoader();
    }
}

export async function exportReportToPDF() {
    showLoader();
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // --- 1. Get Filters ---
        const timeFilter = document.getElementById('time-filter-type')?.value || 'all';
        const monthFilter = document.getElementById('report-month-picker')?.value;
        const dayFilter = document.getElementById('report-day-picker')?.value;
        const userFilter = document.getElementById('user-filter')?.value || 'all';

        // --- 2. Filter Data from State ---
        let selectedPeriod = null;
        let periodType = 'all';
        if (timeFilter === 'month' && monthFilter) { selectedPeriod = monthFilter; periodType = 'month'; }
        if (timeFilter === 'day' && dayFilter) { selectedPeriod = dayFilter; periodType = 'day'; }

        let filteredSales = state.sales;
        let filteredDefects = state.defects;
        let filteredPayments = state.suppliers.flatMap(s => s.payments || []);
        let filteredShipments = state.shipments; // Filter shipments too

        if (selectedPeriod) {
            filteredSales = filteredSales.filter(s => s.createdAt.startsWith(selectedPeriod));
            filteredDefects = filteredDefects.filter(d => d.date.startsWith(selectedPeriod));
            filteredPayments = filteredPayments.filter(p => p.date.startsWith(selectedPeriod));
            filteredShipments = filteredShipments.filter(sh => sh.date && sh.date.startsWith(selectedPeriod)); // Added this
        }
        if (userFilter !== 'all') {
            filteredSales = filteredSales.filter(s => s.cashier === userFilter);
        }

        // --- 3. Calculate All Metrics ---
        let totalRevenue = 0, grossProfit = 0, totalItemsSold = 0, totalCashSales = 0, totalInstaPaySales = 0, totalVCashSales = 0, totalFreeDeliveries = 0;
        let customerShippingExpense = 0;

        filteredSales.forEach(s => {
            totalRevenue += s.totalAmount;
            grossProfit += s.profit;
            if (s.paymentMethod === 'cash') totalCashSales += s.totalAmount;
            if (s.paymentMethod === 'instaPay') totalInstaPaySales += s.totalAmount;
            if (s.paymentMethod === 'vCash') totalVCashSales += s.totalAmount;
            if (s.isFreeDelivery) totalFreeDeliveries++;
            customerShippingExpense += (s.shippingCost || 0) + (s.returnDeliveryFee || 0);
            s.items.forEach(item => {
                totalItemsSold += item.quantity - (item.returnedQty || 0);
            });
        });

        const totalPurchaseCost = filteredShipments.reduce((sum, sh) => sum + sh.totalCost, 0);
        const totalDefectsCost = filteredDefects.reduce((sum, defect) => sum + (defect.purchasePrice * defect.quantity), 0);

        const supplierShippingCost = filteredShipments.reduce((sum, sh) => sum + (sh.shippingCost || 0), 0);

        let totalSalariesExpense = 0;
        const monthForSalaries = periodType === 'day' ? selectedPeriod.slice(0, 7) : selectedPeriod;
        if (monthForSalaries) {
            state.users.forEach(user => {
                if (state.salariesPaidStatus[`${user.username}-${monthForSalaries}`]) {
                    const userData = state.salaries[user.username] || { fixed: 0, commission: 0, bonus: 0 };
                    const piecesSold = state.sales.filter(s => s.createdAt.startsWith(monthForSalaries) && s.cashier === user.username)
                        .reduce((sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + (i.quantity - (i.returnedQty || 0)), 0), 0);
                    totalSalariesExpense += userData.fixed + (piecesSold * userData.commission) + (userData.bonus || 0);
                }
            });
            if (state.expenses.rent.paidStatus[monthForSalaries]) {
                totalSalariesExpense += state.expenses.rent.amount || 0;
            }
        }

        const totalExpenses = totalPurchaseCost + totalSalariesExpense + customerShippingExpense + supplierShippingCost + totalDefectsCost;
        const netProfit = grossProfit - totalSalariesExpense - customerShippingExpense - supplierShippingCost - totalDefectsCost;

        // --- 4. Build PDF ---
        doc.setFont('helvetica', 'normal');
        doc.text("Sales Report", 105, 15, { align: 'center' });
        let filterText = `Filters: Time - ${timeFilter}`;
        if (timeFilter === 'month' && monthFilter) filterText += ` (${monthFilter})`;
        if (timeFilter === 'day' && dayFilter) filterText += ` (${dayFilter})`;
        filterText += `, Cashier - ${userFilter}`;
        doc.setFontSize(10);
        doc.text(filterText, 105, 22, { align: 'center' });

        const summaryData = [
            [{ content: 'Income & Profit', colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#d4edda' } }],
            ['Total Revenue', `${totalRevenue.toFixed(2)} EGP`],
            ['Gross Profit', `${grossProfit.toFixed(2)} EGP`],
            [{ content: 'Expenses', colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#f8d7da' } }],
            ['Stock Purchase Cost', `${totalPurchaseCost.toFixed(2)} EGP`],
            ['Salaries & Rent', `${totalSalariesExpense.toFixed(2)} EGP`],
            ['Customer Shipping', `${customerShippingExpense.toFixed(2)} EGP`],
            ['Supplier Shipping', `${supplierShippingCost.toFixed(2)} EGP`],
            ['Defects Cost', `${totalDefectsCost.toFixed(2)} EGP`],
            ['Total Expenses', `${totalExpenses.toFixed(2)} EGP`],
            [{ content: 'Net Summary', colSpan: 2, styles: { fontStyle: 'bold', fillColor: '#d1ecf1' } }],
            ['Net Profit', `${netProfit.toFixed(2)} EGP`],
        ];

        doc.autoTable({
            startY: 30,
            head: [['Metric', 'Value']],
            body: summaryData,
            theme: 'striped',
            headStyles: { fillColor: [176, 136, 142] }
        });

        const salesData = filteredSales.map(sale => [
            sale.id,
            new Date(sale.createdAt).toLocaleDateString(),
            sale.customerName || 'N/A',
            sale.cashier,
            `${sale.totalAmount.toFixed(2)} EGP`
        ]);

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [['ID', 'Date', 'Customer', 'Cashier', 'Total']],
            body: salesData,
            theme: 'grid',
            headStyles: { fillColor: [176, 136, 142] }
        });

        doc.save(`sales-report-${new Date().toISOString().slice(0, 10)}.pdf`);
        showNotification('Report exported to PDF.', 'success');
    } catch (error) {
        console.error("PDF Export Error:", error);
        showNotification('Failed to export PDF.', 'error');
    } finally {
        hideLoader();
    }
}

// [MODIFIED] - Reworked for detailed inventory report with product codes
export async function exportInventoryToPDF() {
    showLoader();
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFont('helvetica', 'normal');
        doc.text("Detailed Inventory Report", 148, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 148, 22, { align: 'center' });

        const body = [];
        state.products.forEach(p => {
            // Main product row with the new 'Code' field
            body.push([
                { content: p.name, styles: { fontStyle: 'bold', fillColor: '#F5EBEB' } },
                { content: p.code || 'N/A', styles: { fontStyle: 'bold', fillColor: '#F5EBEB' } }, // <-- Added
                { content: p.category || 'N/A', styles: { fontStyle: 'bold', fillColor: '#F5EBEB' } },
                '', '', '', '', // Empty cells for alignment
                { content: getProductTotalQuantity(p), styles: { fontStyle: 'bold', fillColor: '#F5EBEB' } },
            ]);

            // Detailed rows for each variant, now with an extra empty cell for alignment
            if (p.colors) {
                Object.entries(p.colors).forEach(([color, colorData]) => {
                    if (colorData.sizes) {
                        Object.entries(colorData.sizes).forEach(([size, sizeData]) => {
                            body.push([
                                '', // Empty cell under Product Name
                                '', // Empty cell under Code <-- Added
                                '', // Empty cell under Category
                                color,
                                size,
                                sizeData.purchasePrice ? sizeData.purchasePrice.toFixed(2) : p.purchasePrice.toFixed(2),
                                p.sellingPrice.toFixed(2),
                                sizeData.quantity,
                            ]);
                        });
                    }
                });
            }
        });

        doc.autoTable({
            startY: 30,
            // Header updated to include the 'Code' column
            head: [['Product Name', 'Code', 'Category', 'Color', 'Size', 'Purchase Price', 'Selling Price', 'Stock Qty']],
            body: body,
            theme: 'striped',
            headStyles: { fillColor: [176, 136, 142] },
            didDrawCell: (data) => {
                // Custom styling for main product rows
                if (data.row.raw[0].styles && data.row.raw[0].styles.fontStyle === 'bold') {
                    doc.setFont(undefined, 'bold');
                }
            },
        });

        doc.save(`detailed-inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`);
        showNotification('Detailed inventory report exported to PDF.', 'success');
    } catch (error) {
        console.error("Inventory PDF Export Error:", error);
        showNotification('Failed to export inventory report.', 'error');
    } finally {
        hideLoader();
    }
}


export async function exportReturnsToPDF() {
    showLoader();
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont('helvetica', 'normal');
        doc.text("Returns Report", 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 22, { align: 'center' });

        const returnsData = [];
        state.sales.forEach(sale => {
            sale.items.forEach(item => {
                if (item.returnedQty && item.returnedQty > 0) {
                    const returnedValue = item.unitPrice * item.returnedQty;
                    const discountRatio = sale.subtotal > 0 ? sale.discountAmount / sale.subtotal : 0;
                    const netReturnedValue = returnedValue - (returnedValue * discountRatio);

                    returnsData.push([
                        sale.id,
                        new Date(sale.createdAt).toLocaleDateString(),
                        item.productName,
                        item.returnedQty,
                        netReturnedValue.toFixed(2)
                    ]);
                }
            });
        });

        if (returnsData.length === 0) {
            showNotification("No returns to export.", "info");
            return;
        }

        doc.autoTable({
            startY: 30,
            head: [['Sale ID', 'Date', 'Product', 'Qty Returned', 'Value (EGP)']],
            body: returnsData,
            theme: 'grid',
            headStyles: { fillColor: [176, 136, 142] }
        });

        doc.save(`returns-report-${new Date().toISOString().slice(0, 10)}.pdf`);
        showNotification('Returns report exported to PDF.', 'success');
    } catch (error) {
        console.error("Returns PDF Export Error:", error);
        showNotification('Failed to export returns report.', 'error');
    } finally {
        hideLoader();
    }
}

export function exportCustomersToExcel() {
    showLoader();
    try {
        const worksheet = XLSX.utils.json_to_sheet(state.customers.map(c => ({
            Name: c.name,
            Phone: c.phone,
            Address: c.address,
            City: c.city,
            'Items Bought': c.totalItemsBought,
            'Last Purchase': c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleDateString() : 'N/A'
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
        XLSX.writeFile(workbook, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`);
        showNotification('Customers exported to Excel.', 'success');
    } catch (error) {
        console.error("Excel Export Error:", error);
        showNotification('Failed to export customers.', 'error');
    } finally {
        hideLoader();
    }
}

export function exportSalariesToExcel() {
    showLoader();
    try {
        const month = state.selectedSalariesMonth || new Date().toISOString().slice(0, 7);
        const salesThisMonth = state.sales.filter(sale => sale.createdAt.startsWith(month));

        const data = state.users.map(user => {
            const userData = state.salaries[user.username] || { fixed: 0, commission: 0, bonus: 0 };
            const piecesSold = salesThisMonth
                .filter(sale => sale.cashier === user.username)
                .reduce((total, sale) => total + sale.items.reduce((itemTotal, item) => itemTotal + (item.quantity - (item.returnedQty || 0)), 0), 0);
            const totalCommission = piecesSold * userData.commission;
            const totalSalary = userData.fixed + totalCommission + (userData.bonus || 0);
            const isPaid = state.salariesPaidStatus[`${user.username}-${month}`] || false;

            return {
                'Employee ID': user.employeeId || 'N/A',
                'Username': user.username,
                'Phone': user.phone || 'N/A',
                'Fixed Salary': userData.fixed,
                'Commission/Piece': userData.commission,
                'Bonus': userData.bonus || 0,
                'Pieces Sold': piecesSold,
                'Total Commission': totalCommission,
                'Total Salary': totalSalary,
                'Paid Status': isPaid ? 'Paid' : 'Unpaid'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Salaries ${month}`);
        XLSX.writeFile(workbook, `salaries-report-${month}.xlsx`);
        showNotification('Salaries report exported to Excel.', 'success');
    } catch (error) {
        console.error("Salaries Excel Export Error:", error);
        showNotification('Failed to export salaries report.', 'error');
    } finally {
        hideLoader();
    }
}

// [--- إصلاح ---] تم تعديل دالة الطباعة لتعتمد على مقارنة السلسلة النصية للتاريخ
export async function printShipmentInvoice(supplierId, date) {
    showLoader();
    try {
        // [--- إصلاح ---] استخدام .startsWith() لمقارنة التواريخ بشكل آمن
        const shipmentsOnDate = state.shipments.filter(s => s.supplierId === supplierId && s.date.startsWith(date));

        if (shipmentsOnDate.length === 0) {
            showNotification(`No shipments found for this supplier on ${new Date(date).toLocaleDateString()}.`, 'error');
            return;
        }

        const supplier = state.suppliers.find(s => s.id === supplierId);
        const supplierName = supplier ? supplier.name : 'Unknown Supplier';

        const allItems = shipmentsOnDate.flatMap(s => s.items);
        const grossCost = shipmentsOnDate.reduce((sum, s) => sum + s.totalCost, 0);
        const shippingCost = shipmentsOnDate.reduce((sum, s) => sum + (s.shippingCost || 0), 0);

        const defectsForInvoice = state.defects.filter(d => d.supplierId === supplierId && d.shipmentDate === date);
        const defectsValue = defectsForInvoice.reduce((sum, d) => sum + (d.quantity * d.purchasePrice), 0);
        const netCost = grossCost - defectsValue;
        const finalTotal = netCost + shippingCost;

        const itemsHtml = allItems.map(item => {
            const product = state.products.find(p => p.id === item.productId);
            const defectiveCountForItem = defectsForInvoice
                .filter(d => d.productId === item.productId && d.color === item.color && d.size === item.size)
                .reduce((sum, d) => sum + d.quantity, 0);

            const quantityDisplay = defectiveCountForItem > 0
                ? `${item.quantity} <span style="color: #C97C7C; font-style: italic;">(${defectiveCountForItem} defective)</span>`
                : item.quantity;

            return `
                <tr>
                    <td>${product ? product.name : 'Unknown'} (${item.color}/${item.size})</td>
                    <td>${quantityDisplay}</td>
                    <td>${item.purchasePrice.toFixed(2)}</td>
                    <td>${(item.quantity * item.purchasePrice).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const defectsHtml = defectsForInvoice.map(defect => `
            <tr class="defective-row">
                <td>${defect.productName} (${defect.color}/${defect.size}) - ${defect.reason}</td>
                <td>${defect.quantity}</td>
                <td>${defect.purchasePrice.toFixed(2)}</td>
                <td>${(defect.quantity * defect.purchasePrice).toFixed(2)}</td>
            </tr>
        `).join('');

        const defectsSection = defectsForInvoice.length > 0 ? `
            <h2 style="color: #C97C7C;">Defective Items Details</h2>
            <table>
                <thead>
                    <tr><th>Product & Reason</th><th>Quantity</th><th>Unit Cost</th><th>Total Cost</th></tr>
                </thead>
                <tbody>${defectsHtml}</tbody>
            </table>
        ` : '';

        const template = `
            <html>
                <head>
                    <title>Shipment Invoice for ${new Date(date).toLocaleDateString()}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        h1, h2 { text-align: center; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .summary { text-align: right; margin-top: 20px; font-size: 1.2em; border-top: 2px solid #333; padding-top: 10px; }
                        .summary p { margin: 5px 0; }
                        .defective-row { color: #C97C7C; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>Shipment Invoice</h1>
                    <p><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</p>
                    <p><strong>Supplier:</strong> ${supplierName}</p>
                    
                    <h2>Received Items</h2>
                    <table>
                        <thead>
                            <tr><th>Product</th><th>Quantity</th><th>Unit Cost (EGP)</th><th>Total Cost (EGP)</th></tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                    
                    ${defectsSection}

                    <div class="summary">
                        <p><strong>Gross Cost:</strong> ${grossCost.toFixed(2)} EGP</p>
                        ${defectsValue > 0 ? `<p><strong>Defects Value:</strong> <span style="color: #C97C7C;">-${defectsValue.toFixed(2)} EGP</span></p>` : ''}
                        <p><strong>Net Cost:</strong> ${netCost.toFixed(2)} EGP</p>
                        <p><strong>Shipping Cost:</strong> ${shippingCost.toFixed(2)} EGP</p>
                        <p><strong>Final Total: ${finalTotal.toFixed(2)} EGP</strong></p>
                    </div>
                </body>
            </html>
        `;

        const printWindow = window.open('', 'PRINT', 'height=800,width=600');
        printWindow.document.write(template);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            setTimeout(() => printWindow.close(), 1000);
        }, 500);

    } catch (error) {
        console.error("Error printing shipment invoice:", error);
        showNotification("An error occurred while printing.", "error");
    } finally {
        hideLoader();
    }
}

// [--- إضافة ---] دالة جديدة لتصدير تقرير اليومية
export async function exportShiftToPDF(shift) {
    showLoader();
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // --- بناء التقرير ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Shift Report', 105, 20, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Shift ID: ${shift.id}`, 14, 30);
        doc.text(`Ended By: ${shift.endedBy}`, 14, 37);
        doc.text(`Started: ${new Date(shift.startedAt).toLocaleString()}`, 105, 30, { align: 'center' });
        doc.text(`Ended: ${new Date(shift.endedAt).toLocaleString()}`, 105, 37, { align: 'center' });

        // Summary Table
        const summaryData = [
            ['Total Sales', `${shift.summary.totalSales.toFixed(2)} EGP`],
            ['Total Returns', `${shift.summary.totalReturnsValue.toFixed(2)} EGP`],
            ['Daily Expenses', `${shift.summary.totalDailyExpenses.toFixed(2)} EGP`],
            ['Expected in Drawer', `${shift.summary.expectedInDrawer.toFixed(2)} EGP`],
            ['Actual in Drawer', `${shift.reconciliation.actual.toFixed(2)} EGP`],
            ['Difference', `${shift.reconciliation.difference.toFixed(2)} EGP (${shift.reconciliation.type})`],
        ];
        doc.autoTable({
            startY: 45,
            head: [['Summary', 'Amount']],
            body: summaryData,
            theme: 'striped',
        });

        // Sales Details
        if (shift.sales.length > 0) {
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 10,
                head: [['ID', 'Time', 'Cashier', 'Method', 'Amount']],
                body: shift.sales.map(s => [s.id, new Date(s.createdAt).toLocaleTimeString(), s.cashier, s.paymentMethod, s.totalAmount.toFixed(2)]),
                theme: 'grid',
                headStyles: { fillColor: [22, 160, 133] }
            });
        }

        // Returns Details
        if (shift.returns.length > 0) {
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 10,
                head: [['Original ID', 'Time', 'Cashier', 'Amount']],
                body: shift.returns.map(r => [r.originalSaleId, new Date(r.returnedAt).toLocaleTimeString(), r.cashier, r.returnValue.toFixed(2)]),
                theme: 'grid',
                headStyles: { fillColor: [231, 76, 60] }
            });
        }

        // Expenses Details
        if (shift.expenses.length > 0) {
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 10,
                head: [['Time', 'Amount', 'Notes']],
                body: shift.expenses.map(e => [new Date(e.date).toLocaleTimeString(), e.amount.toFixed(2), e.notes]),
                theme: 'grid',
                headStyles: { fillColor: [243, 156, 18] }
            });
        }

        const pdfOutput = doc.output('arraybuffer');
        const fileName = `Shift-Report-${shift.id}.pdf`;

        await window.api.saveShiftPDF({ pdfData: new Uint8Array(pdfOutput), fileName });
        showNotification('Shift report PDF saved successfully!', 'success');

    } catch (error) {
        console.error("Shift PDF Export Error:", error);
        showNotification('Failed to export shift report.', 'error');
    } finally {
        hideLoader();
    }
}
