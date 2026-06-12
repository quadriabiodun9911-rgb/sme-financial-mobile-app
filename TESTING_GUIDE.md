# FinanceBook Web App - Testing Guide

## ✅ Pre-Launch Testing Checklist

All components are ready to test. The web app is running and serving at `http://localhost:8081`

---

## 🚀 How to Access the App

### Option 1: Local Testing (Your Machine)
If the dev server is running on your local machine:
```
Open: http://localhost:8081
```

### Option 2: Remote Server
If running on a remote server, you may need to:
1. Set up port forwarding: `ssh -L 8081:localhost:8081 user@server`
2. Then open: `http://localhost:8081` in your browser

---

## 📋 Testing Checklist

### 1️⃣ Page Load & No Blank Page
- [ ] Open http://localhost:8081
- [ ] **Verify:** Page loads completely (not blank)
- [ ] **Verify:** Title shows "FinanceBook"
- [ ] **Verify:** Login screen appears with email/PIN fields
- [ ] **Verify:** Open DevTools (F12) → Console tab
  - No red error messages
  - No "Failed to fetch" errors
  - No unhandled promise rejections

### 2️⃣ Registration with PIN
- [ ] Click "Create Account" button
- [ ] Enter test email: `test@example.com`
- [ ] Enter business name: `Test Business`
- [ ] Enter PIN: `1234`
- [ ] Confirm PIN: `1234`
- [ ] **Verify:** Load demo data checkbox available
- [ ] Check "Load demo data" checkbox
- [ ] Click "Create Account"
- [ ] **Verify:** Page transitions to Dashboard (not blank)
- [ ] **Verify:** No errors in console

### 3️⃣ Dashboard - Hero Profit Card
- [ ] **Verify:** Profit card displays at top
- [ ] **Verify:** Shows profit amount (e.g., "$XX,XXX")
- [ ] **Verify:** Shows currency symbol ($)
- [ ] **Verify:** Shows profit percentage change
- [ ] **Verify:** Card is styled (dark theme, readable text)
- [ ] **Verify:** No missing fonts or broken styles
- [ ] **Verify:** Responsive on mobile browser view

### 4️⃣ Quick-Add Transaction (FAB)
- [ ] **Verify:** Floating Action Button (FAB) visible in bottom right
- [ ] Click FAB (should be a "+" or "Add" button)
- [ ] **Verify:** Quick-add modal appears
- [ ] Enter transaction details:
  - Description: "Test Income"
  - Type: Income
  - Category: "Software sales"
  - Amount: 1000
- [ ] Click "Add"
- [ ] **Verify:** Modal closes
- [ ] **Verify:** Transaction appears in list
- [ ] **Verify:** Profit card updates with new amount
- [ ] **Verify:** No console errors

### 5️⃣ Footer Navigation
- [ ] **Verify:** 5 navigation tabs visible at bottom:
  1. Dashboard (⬛)
  2. Reports (📊)
  3. Growth (📈) ← **NEW FEATURE**
  4. Invoices (🧾)
  5. Ledger (📒)
- [ ] Each tab is clickable
- [ ] Active tab is highlighted
- [ ] No styling issues with tabs

### 6️⃣ Growth Intelligence Tab (NEW FEATURE)
- [ ] Click "Growth" tab (📈)
- [ ] **Verify:** Page transitions to Growth Intelligence screen
- [ ] **Verify:** 3 sub-tabs visible:
  1. **Profit Drivers** (💡)
  2. **By Dimension** (📊)
  3. **Breakeven** (🎯)

#### Tab 1: Profit Drivers
- [ ] Click "Profit Drivers" tab
- [ ] **Verify:** Shows list of profit drivers
- [ ] **Verify:** Each driver shows:
  - Driver name (e.g., "Revenue from Software Sales")
  - Contribution % (e.g., "45%")
  - Impact arrow (↑ or ↓)
- [ ] **Verify:** Drivers sorted by impact
- [ ] **Verify:** Styles are clean and readable

#### Tab 2: By Dimension
- [ ] Click "By Dimension" tab
- [ ] **Verify:** Shows profit breakdown by:
  - Categories (e.g., "Software sales", "Consulting")
  - Vendors/Customers (e.g., "TechCorp Inc.")
  - Or both (depending on data)
- [ ] **Verify:** Shows:
  - Item name
  - Profit amount
  - Profit margin %
- [ ] **Verify:** Data aligns with Dashboard transactions

#### Tab 3: Breakeven Analysis
- [ ] Click "Breakeven" tab
- [ ] **Verify:** Shows breakeven point calculation:
  - Fixed costs
  - Variable cost %
  - Breakeven revenue amount
  - Current vs. breakeven (progress indicator)
- [ ] **Verify:** Chart or visual indicator
- [ ] **Verify:** Safe margin calculation shown
- [ ] **Verify:** No calculation errors

### 7️⃣ Reports Screen
- [ ] Click "Reports" tab (📊)
- [ ] **Verify:** Page loads with report options
- [ ] **Verify:** Shows financial reports:
  - Profit & Loss
  - Cash Flow (Accrual/Cash)
  - Balance Sheet
- [ ] Click on one report
- [ ] **Verify:** Report renders with data
- [ ] **Verify:** Totals are calculated correctly
- [ ] **Verify:** Styling is professional

### 8️⃣ Inventory Management
- [ ] Click "Ledger" or find Inventory option
- [ ] **Verify:** Inventory screen loads
- [ ] Click "Add Item" button
- [ ] Enter inventory item:
  - Name: "Widget A"
  - SKU: "WID-001"
  - Quantity: 50
  - Unit Cost: 10
- [ ] Click "Add"
- [ ] **Verify:** Item appears in inventory list
- [ ] **Verify:** Total value calculated (50 × $10 = $500)
- [ ] **Verify:** No console errors

### 9️⃣ Calculations Correctness
- [ ] Add multiple transactions with different amounts
- [ ] Navigate to Growth tab
- [ ] **Verify:** Profit calculations are correct
  - Manual calculation: Income - Expenses = Profit
  - Compare with app's profit card
- [ ] **Verify:** Percentages are accurate
- [ ] **Verify:** No NaN or infinity values shown
- [ ] **Verify:** Negative values display with minus sign (-)

### 🔟 Navigation Flow
- [ ] Test clicking between all tabs:
  - Dashboard → Reports → Growth → Invoices → Ledger
  - Ledger → Dashboard (in reverse)
- [ ] **Verify:** Smooth transitions
- [ ] **Verify:** No console errors
- [ ] **Verify:** Data persists when switching tabs
- [ ] **Verify:** Active tab indicator updates

### 1️⃣1️⃣ Responsive Design
- [ ] Open DevTools (F12)
- [ ] Click device toggle (responsive mode)
- [ ] Test at different breakpoints:
  - Mobile: 375×667 (iPhone)
  - Tablet: 768×1024 (iPad)
  - Desktop: 1920×1080
- [ ] **Verify:** App looks good at each size
- [ ] **Verify:** Text is readable
- [ ] **Verify:** Buttons are clickable
- [ ] **Verify:** No horizontal scroll on mobile
- [ ] **Verify:** Layout adjusts properly

### 1️⃣2️⃣ Data Persistence
- [ ] Add a transaction
- [ ] Refresh the page (F5)
- [ ] **Verify:** Transaction still appears
- [ ] **Verify:** Profit amounts unchanged
- [ ] **Verify:** All data persists (uses AsyncStorage)
- [ ] Log out (if logout option available)
- [ ] Log in again with same PIN
- [ ] **Verify:** All previous data loads

### 1️⃣3️⃣ Error Handling
- [ ] Try invalid actions:
  - Enter negative amount: -500
  - Leave required fields empty
  - Enter very large number: 9999999999
- [ ] **Verify:** Appropriate error messages shown
- [ ] **Verify:** App doesn't crash
- [ ] **Verify:** User can recover and try again

### 1️⃣4️⃣ Performance
- [ ] Open DevTools → Performance tab
- [ ] Click the Growth tab
- [ ] **Verify:** Page loads in <3 seconds
- [ ] Add 20+ transactions
- [ ] Navigate to Growth tab
- [ ] **Verify:** Still responsive (no lag)
- [ ] **Verify:** Calculations still correct

---

## 🐛 Issue Tracking

If you find any issues, note:
- [ ] **Issue Title:** (e.g., "Profit card shows wrong amount")
- [ ] **Steps to Reproduce:**
  1. ...
  2. ...
  3. ...
- [ ] **Expected:** What should happen
- [ ] **Actual:** What actually happens
- [ ] **Browser:** Chrome/Firefox/Safari/Edge
- [ ] **Screenshot:** If possible
- [ ] **Console Error:** Copy from DevTools → Console

---

## ✨ Features to Verify Are Working

- ✅ **Login/Registration** - PIN-based authentication
- ✅ **Dashboard** - Profit card with key metrics
- ✅ **Transactions** - Add income/expenses with quick-add FAB
- ✅ **Growth Intelligence** - NEW 3-tab feature:
  - Profit Drivers - What makes money?
  - By Dimension - Profit by category/vendor
  - Breakeven - When does business break even?
- ✅ **Reports** - P&L, Cash Flow, Balance Sheet
- ✅ **Inventory** - Track items and stock value
- ✅ **Data Persistence** - Everything saved locally
- ✅ **Responsive** - Works on mobile/tablet/desktop

---

## 📊 Success Criteria

**App is ready to launch if:**
- [ ] No blank page on load
- [ ] All navigation tabs visible and clickable
- [ ] Growth tab shows 3 sub-tabs with data
- [ ] Profit calculations are accurate
- [ ] No console errors
- [ ] Responsive on mobile/desktop
- [ ] Data persists after refresh
- [ ] Professional styling throughout

---

## 🚀 Next Steps After Testing

1. **If issues found:** Report them with details above
2. **If all tests pass:** Ready to deploy!
   ```bash
   # Deploy to Netlify
   vercel --prod
   
   # Or build Android APK
   eas login
   eas build --platform android --local
   ```

---

## 📱 Testing Tips

- **Hard Refresh:** Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- **DevTools Console:** F12 → Console tab
- **Network Issues:** Check Network tab in DevTools
- **Mobile Testing:** Use Chrome DevTools device emulation
- **Local Storage:** DevTools → Application → Local Storage
- **Performance:** DevTools → Performance tab, record actions

---

## 🎯 What NOT to Worry About

- ❌ Old browsers (IE11) - We target modern browsers
- ❌ Offline mode initially - Web version is online-only
- ❌ Account security features - Not tested in beta
- ❌ Email/API integrations - Not in Phase 1
- ❌ Print formatting - Desktop use only

---

Good luck testing! 🚀
