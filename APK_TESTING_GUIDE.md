# FinanceBook Android APK Testing Guide

## 📱 Installation & Setup

### Prerequisites
- Android phone or emulator (Android 8.0 or higher recommended)
- APK file built from `eas build -p android -e preview --local`
- USB cable (if installing on physical device)

### Installation Methods

#### Method 1: Physical Device (USB)
1. **Enable Developer Mode**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Go back to Settings → Developer Options → Enable USB Debugging

2. **Connect Device**
   ```bash
   adb devices
   adb install FinanceBook-APK.apk
   ```

3. **Launch App**
   - Find "FinanceBook" in app drawer
   - Tap to launch

#### Method 2: Android Emulator
1. **Start Emulator**
   ```bash
   emulator -avd <emulator_name>
   ```

2. **Install APK**
   ```bash
   adb install FinanceBook-APK.apk
   ```

3. **Launch App**
   - App appears in app drawer

#### Method 3: Manual Transfer
1. Copy APK file to phone via USB
2. Use file manager to locate APK
3. Tap APK to install
4. Grant permissions if prompted

---

## 🧪 Test Scenarios

### Scenario 1: First-Time User Registration
**Goal:** Verify registration flow works on Android

**Steps:**
1. Launch app
2. You should see login screen with:
   - ✅ Email input field
   - ✅ PIN field (password input)
   - ✅ "Create Account" or "Start Fresh" button
3. Tap "Start Fresh" to reset (if needed)
4. Fill in registration form:
   - Email: `test@example.com`
   - Business Name: `Test Business`
   - PIN: `1234`
   - Confirm PIN: `1234`
5. Select currency (e.g., USD)
6. Tap "Create Account"

**Expected Result:**
- ✅ Registration completes without errors
- ✅ Dashboard screen appears
- ✅ No crash or blank page
- ✅ Profit card visible at top

**Pass/Fail:** _______

---

### Scenario 2: Dashboard & Profit Card
**Goal:** Verify dashboard displays financial metrics

**Steps:**
1. After registration, dashboard should show:
   - Profit card at the top
   - Currency symbol ($, €, ₦, etc.)
   - Profit amount
   - Profit percentage change (↑ or ↓)
2. Scroll down to see:
   - Transaction list (empty on first launch)
   - Recent activity

**Expected Result:**
- ✅ Profit card styled properly (dark theme)
- ✅ Currency symbol matches selected currency
- ✅ Numbers formatted correctly (no NaN or errors)
- ✅ Professional appearance

**Pass/Fail:** _______

---

### Scenario 3: Navigation Tabs
**Goal:** Verify all 5 navigation tabs are accessible

**Steps:**
1. Look at bottom of screen
2. You should see 5 tabs:
   - 📊 Dashboard
   - 📈 Reports
   - 💡 Growth (NEW)
   - 🧾 Invoices
   - 📒 Ledger
3. Tap each tab and verify page loads

**Expected Result:**
- ✅ All 5 tabs visible
- ✅ Each tab clickable
- ✅ Active tab highlighted
- ✅ Smooth transitions between tabs
- ✅ No console errors (check Android logs)

**Pass/Fail:** _______

---

### Scenario 4: Quick-Add Transaction (FAB)
**Goal:** Verify floating action button and transaction creation

**Steps:**
1. On Dashboard tab
2. Look for floating action button (FAB) - usually a "+" button
3. Tap FAB
4. Modal should appear with form:
   - Description field
   - Type selector (Income/Expense)
   - Category dropdown
   - Amount field
5. Fill in test transaction:
   - Description: "Test Income"
   - Type: Income
   - Category: "Software Sales" (or similar)
   - Amount: 1000
6. Tap "Add" button

**Expected Result:**
- ✅ FAB visible and clickable
- ✅ Modal appears smoothly
- ✅ Form fields work (keyboard opens)
- ✅ Transaction added successfully
- ✅ Modal closes
- ✅ Transaction appears in list
- ✅ Profit card updates with new amount

**Pass/Fail:** _______

---

### Scenario 5: Growth Intelligence (NEW FEATURE)
**Goal:** Test the new Growth Intelligence feature with 3 sub-tabs

**Steps:**
1. Tap "Growth" tab (📈)
2. Page should load with 3 sub-tabs:
   - 💡 Profit Drivers
   - 📊 By Dimension
   - 🎯 Breakeven

**Testing Each Sub-tab:**

#### 5a: Profit Drivers
1. Tap "Profit Drivers" tab
2. Should show:
   - Driver name (e.g., "Software Sales")
   - Contribution % (e.g., "45%")
   - Impact indicator (↑ or ↓)
3. Verify:
   - ✅ Data displays correctly
   - ✅ Percentages add up correctly
   - ✅ Styling is clean

**Pass/Fail:** _______

#### 5b: By Dimension
1. Tap "By Dimension" tab
2. Should show breakdown by:
   - Categories or Vendors
3. Each item should show:
   - Name
   - Profit amount
   - Profit margin %
4. Verify:
   - ✅ Data matches dashboard transactions
   - ✅ Numbers are accurate
   - ✅ Layout is readable on mobile screen

**Pass/Fail:** _______

#### 5c: Breakeven Analysis
1. Tap "Breakeven" tab
2. Should show:
   - Fixed costs
   - Variable cost percentage
   - Breakeven revenue amount
   - Current vs. breakeven (progress bar or indicator)
   - Safety margin calculation
3. Verify:
   - ✅ All metrics displayed
   - ✅ Calculations are correct
   - ✅ Visual representation is clear

**Pass/Fail:** _______

---

### Scenario 6: Reports
**Goal:** Verify financial reports display correctly

**Steps:**
1. Tap "Reports" tab (📊)
2. Should see report options:
   - Profit & Loss (P&L)
   - Cash Flow (Accrual/Cash)
   - Balance Sheet
3. Select each report
4. Verify:
   - ✅ Report loads and displays data
   - ✅ Totals are calculated correctly
   - ✅ Numbers match transactions
   - ✅ Professional formatting

**Expected Result:**
- ✅ All reports accessible
- ✅ Data accurate
- ✅ Responsive on mobile screen
- ✅ No calculation errors

**Pass/Fail:** _______

---

### Scenario 7: Inventory Management
**Goal:** Test inventory tracking feature

**Steps:**
1. Tap "Ledger" tab (📒) or find Inventory option
2. Should see inventory screen
3. Look for "Add Item" button
4. Add inventory item:
   - Name: "Widget A"
   - SKU: "WID-001"
   - Quantity: 50
   - Unit Cost: 10
5. Tap "Add"

**Expected Result:**
- ✅ Inventory screen loads
- ✅ Add Item form works
- ✅ Item appears in list
- ✅ Total value calculated (50 × $10 = $500)
- ✅ Currency formatting correct

**Pass/Fail:** _______

---

### Scenario 8: Data Persistence
**Goal:** Verify data saves and persists

**Steps:**
1. Add a transaction on Dashboard
2. Note the profit amount
3. Close app completely (swipe from recent apps)
4. Wait 10 seconds
5. Reopen app
6. Verify:
   - ✅ Transaction still exists
   - ✅ Profit amount unchanged
   - ✅ All data loaded correctly

**Pass/Fail:** _______

---

### Scenario 9: Login After Logout
**Goal:** Verify returning user login flow

**Steps:**
1. Go to Settings (if available) or find logout option
2. Log out / Reset app
3. App should show login screen
4. Enter PIN: `1234`
5. Tap "Unlock"

**Expected Result:**
- ✅ Login screen appears
- ✅ PIN input works
- ✅ Dashboard loads after unlock
- ✅ Previous data restored

**Pass/Fail:** _______

---

### Scenario 10: Responsive Design & Mobile Layout
**Goal:** Verify app works well on mobile screen

**Steps:**
1. Test all screens in both orientations:
   - Portrait (default)
   - Landscape (rotate device)
2. Check each screen for:
   - Text readability
   - Button clickability
   - No horizontal scroll needed
   - Proper spacing
   - No overlapping elements

**Expected Result:**
- ✅ App responsive at all orientations
- ✅ Touch targets appropriately sized
- ✅ Text readable without zoom
- ✅ Professional appearance

**Pass/Fail:** _______

---

## 🐛 Issue Reporting

If you find issues, please note:

### Issue Template
```
**Title:** Brief description of issue

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Device:** Model, Android version
Example: Samsung Galaxy S21, Android 12

**Screenshot:** Include if possible

**Console Error:** Check Android logcat for errors
adb logcat | grep FinanceBook
```

---

## 📊 Testing Checklist

- [ ] First-time registration works
- [ ] Dashboard displays profit card
- [ ] All 5 navigation tabs visible and clickable
- [ ] Quick-add transaction (FAB) works
- [ ] Growth Intelligence 3 tabs accessible
- [ ] Profit Drivers data displays correctly
- [ ] By Dimension breakdown accurate
- [ ] Breakeven analysis calculations correct
- [ ] Reports load and display correctly
- [ ] Inventory management functional
- [ ] Data persists after app close
- [ ] Login/logout flows work
- [ ] App responsive on mobile screen
- [ ] No crashes or blank pages
- [ ] No console errors
- [ ] Professional appearance and styling

---

## ✨ Success Criteria

**App is ready for production if:**
1. ✅ All 10 scenarios pass
2. ✅ No crashes encountered
3. ✅ No console errors
4. ✅ All financial calculations accurate
5. ✅ Professional appearance on Android
6. ✅ Responsive and touch-friendly
7. ✅ Data persists correctly
8. ✅ Growth Intelligence features working

---

## 🔧 Troubleshooting

### App Won't Install
- Check Android version compatibility (8.0+)
- Try clearing cache: `adb shell pm clear [app-package-name]`
- Reinstall APK

### App Crashes on Launch
- Check Android logcat for errors: `adb logcat`
- Clear app data: Settings → Apps → FinanceBook → Storage → Clear Cache/Data
- Reinstall APK

### Data Not Saving
- Check phone storage space
- Ensure app has storage permissions
- Check Android logs for storage errors

### Growth Tab Not Showing
- Add at least 2 transactions before checking Growth tab
- Refresh app
- Check browser console (if testing web version)

---

## 📞 Support

For issues or questions:
1. Check the console/logs
2. Review the steps above
3. Document the issue with screenshots and logs
4. Report to development team

---

Good luck testing! 🚀
