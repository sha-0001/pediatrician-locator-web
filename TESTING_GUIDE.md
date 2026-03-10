# 🧪 QUICK TESTING GUIDE

## Starting the Application

### **Option 1: Local Server (Recommended)**
```bash
# Using Python 3
python -m http.server 8000

# Or Python 2
python -m SimpleHTTPServer 8000

# Or Node.js http-server
npx http-server

# Or VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

Then navigate to: `http://localhost:8000`

### **Option 2: Direct File Open**
- Not recommended (GPS requires HTTPS/localhost)
- Map may work, but geolocation will be blocked

---

## 📱 QUICK TESTS (5 minutes)

### **TEST 1: Map Loads Correctly** ⏱️ 30 seconds
1. Open http://localhost:8000
2. Wait for map to appear
3. See "General Santos City" as center
4. Check clinics load (red/green/orange markers)
5. ✅ **PASS**: Markers visible, no console errors

---

### **TEST 2: GPS Location Works** ⏱️ 1 minute
1. Click 📡 "Get My Location" button
2. Browser asks for location permission → Click "Allow"
3. Wait 10-30 seconds for GPS lock
4. See blue marker on map
5. Left sidebar updates with nearby clinics
6. ✅ **PASS**: Blue marker appears, clinics list updates

**Note**: If GPS slow, manual location modal appears after 45s - you can enter address

---

### **TEST 3: Nearby Clinics List** ⏱️ 30 seconds
1. Scroll left sidebar
2. See "🏥 Nearby Clinics & Hospitals" list
3. Clinics sorted by distance (closest first)
4. Each shows name, distance in km, type
5. ⭐ star icons clickable
6. ✅ **PASS**: List displays, distances show, stars toggle

---

### **TEST 4: Click Clinic & See Route** ⏱️ 1 minute
1. Click any clinic in the list
2. Map zooms to clinic
3. Right panel opens with "Route & Info"
4. Shows clinic details: name, address, phone
5. Shows route distance and time
6. Turn-by-turn directions appear
7. Route line draws on map (blue line)
8. ✅ **PASS**: Route displays with directions

---

### **TEST 5: Transport Mode Switch** ⏱️ 30 seconds
1. Right panel has "Transportation" dropdown
2. Select different modes:
   - 🚗 Private Car
   - 🚶 Walking
   - 🚴 Bike
   - 🚌 Public Transport
   - 🏍️ Motorcycle
3. Route recalculates for each
4. Distance/duration updates
5. ✅ **PASS**: Route changes for each mode

---

### **TEST 6: Search & Filter** ⏱️ 1 minute
1. Top search bar: type clinic name (e.g., "General")
2. Clinics list filters by search
3. Left sidebar: check "Show only open clinics"
4. Map only shows green markers (open)
5. Uncheck: all markers show again
6. ✅ **PASS**: Search & filter work

---

### **TEST 7: Theme Switching** ⏱️ 30 seconds
1. Left collapsed panel (☰) shows icons
2. Click 🌙 theme button repeatedly
3. Cycles: Light (☀️) → Dark (🌙) → Auto (🔄)
4. Colors change appropriately
5. Setting persists on reload
6. ✅ **PASS**: Theme switches, persists

---

### **TEST 8: Map Layers** ⏱️ 30 seconds
1. Left sidebar "Map Type" section
2. Click "2D" - OSM streets visible
3. Click "Satellite" - satellite imagery
4. Click "Terrain" - topographic
5. Button shows active state
6. ✅ **PASS**: All 3 layers switch

---

### **TEST 9: Community Reporting** ⏱️ 1 minute
1. Select a clinic (click in list)
2. Right panel shows clinic status
3. Look for "📊 Report Availability" button
4. Click it → Modal opens
5. Select "Open" / "Closed" / "Unsure"
6. Add optional notes
7. Click "Submit"
8. See "✅ Thank you!" notification
9. ✅ **PASS**: Report saves, notification shows

---

### **TEST 10: Admin Panel Access** ⏱️ 2 minutes
1. Navigate to: `http://localhost:8000/admin/index%20(admin).html`
   - Or click from main page if link available
2. See 5 tabs: Clinics, Accessibility, Reports, Analytics, Roles
3. Click each tab → content changes
4. **Clinics Tab**:
   - Table shows hospitals/clinics
   - Availability dropdowns work
   - Save button enabled
5. **Accessibility Tab**:
   - Form has clinic selector
   - 5 checkboxes for features
   - Submit button enabled
6. **Reports Tab**:
   - Community reports display
   - Filter by status works
   - Search by clinic works
   - Moderate buttons work
7. **Analytics Tab**:
   - KPIs show numbers
   - Charts display
8. **Roles Tab**:
   - Current role shows
   - Can switch role
   - Permissions change
9. ✅ **PASS**: All sections work, roles restrict access

---

### **TEST 11: Live Tracking** ⏱️ 2 minutes
1. Select a clinic to navigate to
2. Right panel shows "Route & Info"
3. Click ▶ "Start Live Tracking"
4. Button changes to ⏹ "Stop Tracking"
5. Move slightly (if outdoors/mobile)
6. Route updates in real-time
7. Nearby clinics list refreshes with new distances
8. Click ⏹ "Stop Tracking"
9. Tracking stops
10. ✅ **PASS**: Live tracking starts/stops, route updates

---

### **TEST 12: Favorites** ⏱️ 30 seconds
1. In nearby clinics list, click ☆ star (empty)
2. Star becomes ⭐ (filled)
3. See "✅ Added to favorites" notification
4. Reload page
5. Star is still ⭐ (persisted)
6. Click again → ☆ (removed)
7. ✅ **PASS**: Favorites save to localStorage, persist

---

## 🔍 CONSOLE CHECKS

Open Developer Tools (`F12` → Console tab) and check:

### ✅ Should See
```
✅ No red errors in console
✅ "🏥 Pediatrician Locator - GPS-Only Live Tracking Enabled" message
✅ "Loaded X hospitals and clinics" success message
```

### ❌ Should NOT See
```
❌ Uncaught errors
❌ Failed API calls (unless fallback)
❌ Geolocation errors (unless browser blocked)
```

---

## 🐛 COMMON ISSUES & FIXES

### Issue: GPS not working
- **Cause**: Running on `file://` (not `http://` or `https://`)
- **Fix**: Use local server (see "Starting the Application")
- **Or**: Browser blocked location → Settings → Allow location

### Issue: Markers not showing
- **Cause**: Overpass API timeout
- **Fix**: Normal, fallback 5 clinics should show
- **Check**: Look in console for Overpass error

### Issue: Map doesn't load
- **Cause**: Leaflet CDN not loading
- **Fix**: Check internet connection
- **Check**: Console for CDN errors

### Issue: Route not calculating
- **Cause**: OSRM API timeout or no internet
- **Fix**: Check internet connection
- **Try**: Select different transport mode

### Issue: Admin panel empty
- **Cause**: localStorage cleared
- **Fix**: Click "Save Clinic Updates" or refresh
- **Check**: ensureSeedData() runs on load

---

## 📊 DATA PERSISTENCE TEST

### Check localStorage Contents
```javascript
// In browser console:
console.log(localStorage);
// Should see keys like:
// - "theme"
// - "favorites"
// - "clinic-reports-*"
// - "admin-clinics"
// - "admin-users"
// - "admin-role"
// - "admin-user"
```

---

## ✨ EXPECTED BEHAVIOR SUMMARY

| Feature | Expected | Status |
|---------|----------|--------|
| Map displays | Shows GenSan with markers | ✅ |
| GPS works | Blue marker on map | ✅ |
| Clinic selection | Route draws, panel opens | ✅ |
| Transport modes | Route recalculates per mode | ✅ |
| Live tracking | Updates route as you move | ✅ |
| Favorites | Stars persist after reload | ✅ |
| Reporting | Community availability saves | ✅ |
| Admin panel | Tabs work, moderation works | ✅ |
| Theme | Persists after reload | ✅ |
| Layers | 2D/Satellite/Terrain switch | ✅ |

---

## 🎯 FINAL VERIFICATION

If all 12 tests pass (✅), your app is **fully functional** and ready for:
- Deployment to production
- New feature implementation
- Backend integration
- Mobile app wrapper

**Estimated time to complete all tests**: 15-20 minutes

---

## 📝 NOTES FOR DEVELOPERS

- **localStorage Limits**: ~5-10MB per browser (should be fine)
- **GPS Accuracy**: Works best outdoors, clear sky view
- **API Quotas**: 
  - Overpass: ~1 request per second
  - Nominatim: ~1 request per second
  - OSRM: ~10 requests per second
- **Browser Support**: Chrome, Firefox, Edge, Safari (modern versions)
- **Mobile**: Works on Android/iOS browsers with HTTPS

---

**Test Date**: ___________  
**Tester**: ___________  
**All Tests Passed**: [ ] Yes [ ] No

If issues found, document them and refer to the **CODE_RECAP.md** for function explanations.
