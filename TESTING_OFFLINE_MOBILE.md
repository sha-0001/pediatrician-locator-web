# 🧪 Offline & Mobile Testing Guide

**Quick Test Procedures for Offline Mode and Mobile Access Features**

---

## 🚀 Quick Start Testing (5 minutes)

### Test 1: Basic Offline Mode
**Objective**: Verify app works when internet is disconnected

**Steps**:
1. Open app in Chrome on desktop: http://localhost or your URL
2. Let it load completely (see clinics on map)
3. Press `F12` to open DevTools
4. Go to **Network** tab
5. Check the **Offline** checkbox
6. Refresh the page (Ctrl+R)
7. Verify:
   - ✅ Page still loads
   - ✅ "📵 Offline Mode" badge visible in top bar
   - ✅ Clinics still shown on map
   - ✅ Can search for clinics

**Expected Result**: ✅ App fully functional in offline mode

---

### Test 2: Mobile Responsiveness
**Objective**: Verify mobile UI adapts properly

**Steps**:
1. Open app in any browser
2. Press `F12` to open DevTools
3. Click **Toggle device toolbar** (Ctrl+Shift+M)
4. Select different devices from dropdown:
   - iPhone 12
   - Pixel 5
   - iPad
   - Galaxy Tab
5. Test on each:
   - Landscape rotation
   - Button functionality
   - Text readability
   - Map visibility

**Verify on Each Device**:
- ✅ Layout adapts to screen size
- ✅ Buttons are easily tappable
- ✅ Sidebar repositions
- ✅ Map takes full screen
- ✅ No horizontal scrolling

**Expected Result**: ✅ All layouts responsive and functional

---

### Test 3: Service Worker Registration
**Objective**: Confirm Service Worker is properly installed

**Steps**:
1. Open app in any browser
2. Press `F12` to open DevTools
3. Go to **Application** tab
4. Click **Service Workers** in left sidebar
5. Verify you see:
   ```
   Service Worker: /sw.js (active and running)
   ```

**Check Details**:
- ✅ Status shows "active and running"
- ✅ URL shows `/sw.js`
- ✅ Scope shows `/`

**Click "Unregister"** then refresh:
- ✅ Service Worker re-registers automatically
- ✅ Shows new activation

**Expected Result**: ✅ Service Worker working correctly

---

## 📋 Comprehensive Test Suite

### Test 4: Cache Verification
**Objective**: Verify data is being cached

**Steps**:
1. Open DevTools → **Application** tab
2. Click **Cache Storage** in left
3. Click **pedi-locator-v1** cache
4. Verify you see:
   - ✅ index.html
   - ✅ app.js
   - ✅ style.css
   - ✅ manifest.json
   - ✅ sw.js

5. Click **pedi-runtime-v1** cache
6. Verify you see:
   - ✅ Map tile requests
   - ✅ Leaflet library files

**Check Cache Size**:
- DevTools → **Storage** → **Manage**
- See cached data size
- Should be 1-3 MB

**Expected Result**: ✅ Multiple caches populated with data

---

### Test 5: Offline Clinic Search
**Objective**: Search and find clinics while offline

**Prerequisite**: Complete Test 1 first (offline mode enabled)

**Steps**:
1. Enable offline mode (DevTools → Network → Offline)
2. Refresh page
3. In search bar, type clinic name like:
   - "Hospital"
   - "Clinic"
   - "General"
4. Verify:
   - ✅ Suggestions appear
   - ✅ Can select a clinic
   - ✅ Clinic details load
   - ✅ Phone number shows (if available)

5. Try "Find Nearest" button:
   - ✅ Button responds
   - ✅ Finds nearest from cached data
   - ✅ Markers appear on map

**Expected Result**: ✅ All searches work offline

---

### Test 6: Offline Location Tracking
**Objective**: Verify GPS works offline

**Steps**:
1. Keep offline mode enabled
2. Click **"📡 Get My Location"** button
3. Allow location access if prompted
4. Verify:
   - ✅ GPS acquires position
   - ✅ Map centers on location
   - ✅ Location indicator appears
   - ✅ Works offline

**Test Live Tracking**:
1. Click **"Start Live Tracking"** button
2. Verify:
   - ✅ Tracking marker appears
   - ✅ Button shows "Stop Tracking"
   - ✅ Works at least 5 seconds offline

**Expected Result**: ✅ Location tracking works offline

---

### Test 7: Offline Report Submission
**Objective**: Verify reports save while offline and sync later

**Steps While Offline**:
1. Keep offline mode enabled
2. Click on a clinic marker
3. Click **"🔔 Report Status"** button
4. Fill in form:
   - Select "Open" or "Closed"
   - Add notes (optional)
   - Add name (optional)
5. Click **"Submit Report"**
6. Verify notification:
   - ✅ Shows "Report saved offline"

**Check Pending Reports**:
1. Open browser console (F12)
2. Type: `localStorage.getItem('pending-reports')`
3. Verify:
   - ✅ Shows JSON array with report
   - ✅ Has timestamp

**Now Go Back Online**:
1. DevTools → Network → Uncheck Offline
2. Refresh page
3. Verify notification:
   - ✅ "Back online! Syncing data..." appears
   - ✅ "✓ Synced X reports" notification shows

**Check localStorage After Sync**:
1. Type: `localStorage.getItem('pending-reports')`
2. Should show: `[]` (empty array)

**Expected Result**: ✅ Reports queue offline, auto-sync when online

---

### Test 8: Cache Update Cycle
**Objective**: Verify cache updates with fresh data

**Steps**:
1. Online mode, load app completely
2. Console: `localStorage.getItem('cached-clinics-timestamp')`
   - Note the timestamp
3. Enable offline (DevTools)
4. Refresh and verify works
5. Disable offline, refresh
6. Check DevTools → Network tab
7. Look for requests to overpass-api.de
8. Wait for data load complete
9. Console: `localStorage.getItem('cached-clinics-timestamp')`
   - Compare with original timestamp
   - Should be newer

**Expected Result**: ✅ Cache updates on each online session

---

### Test 9: PWA Installation
**Objective**: Verify app can be installed as PWA

#### On Chrome (Desktop/Android):
1. Open app in Chrome
2. Look for **"+"** icon in address bar (top right)
3. Click it
4. Click **"Install"** button
5. Verify:
   - ✅ App installs successfully
   - ✅ Opens in standalone window
   - ✅ No browser UI visible

#### On Safari (iOS):
1. Open app in Safari
2. Tap **Share** button (box with arrow)
3. Scroll and find **"Add to Home Screen"**
4. Tap it
5. Give app a name
6. Tap **"Add"**
7. Verify:
   - ✅ Icon appears on home screen
   - ✅ Icon shows correct color/emoji
   - ✅ App opens in fullscreen

**Test Installed App**:
1. Close browser
2. Tap installed app icon
3. Verify:
   - ✅ App opens immediately
   - ✅ No address bar visible
   - ✅ Full screen mode
   - ✅ Still works offline

**Expected Result**: ✅ Installation works on all platforms

---

### Test 10: Mobile-Specific Features
**Objective**: Test mobile-exclusive functionality

**In Device Emulator (DevTools)**:
1. Go to **Network** tab
2. Change to **iPhone 12** emulation
3. Rotate to landscape (Ctrl+Alt+R)
4. Verify:
   - ✅ Layout rotates properly
   - ✅ Map stays visible
   - ✅ Controls still accessible

5. Rotate back to portrait
6. Scroll down
7. Verify:
   - ✅ Top bar stays fixed
   - ✅ Bottom buttons accessible
   - ✅ No unexpected scrolling

**Test Touch Events**:
1. Stay in device emulation
2. Test all buttons by clicking (simulates tap)
3. Verify all buttons respond:
   - ✅ Search button
   - ✅ Location button
   - ✅ Theme toggle
   - ✅ Favorite button
   - ✅ Clinic action buttons

**Expected Result**: ✅ All mobile features working

---

## 🧪 Real Device Testing

### Test 11: Real Android Device
**Requirements**: Android phone with Chrome, WiFi

**Steps**:
1. Connect to WiFi
2. Open Chrome
3. Go to your app URL
4. Let it load completely (cache builds)
5. Turn OFF WiFi
6. Refresh page
7. Verify still works offline
8. Test searching for clinic
9. Test finding nearest
10. Turn WiFi back ON
11. Verify fresh data loads

**Record Results**: ✅ All functions work

---

### Test 12: Real iOS Device
**Requirements**: iPhone with Safari, WiFi

**Steps**:
1. Connect to WiFi
2. Open Safari
3. Go to your app URL
4. Let it load completely
5. Try "Add to Home Screen"
   - Share → Add to Home Screen
   - Confirm
6. Close Safari
7. Open app from home screen
8. Test offline:
   - Settings → WiFi → OFF
   - Refresh app
   - Verify works offline
9. Turn WiFi back ON
10. Verify fresh data loads

**Record Results**: ✅ All functions work

---

## 📊 Performance Testing

### Test 13: Load Times
**Objective**: Measure performance improvements

**First Load (Offline)**:
1. Enable offline mode
2. Clear cache (DevTools → Application → Clear site data)
3. Refresh page
4. Measure time until:
   - Page loads
   - Should show fallback or cached data

**Subsequent Load (With Cache)**:
1. Go online
2. Refresh (builds cache)
3. Go offline
4. Refresh again
5. Measure time until:
   - Page interactive
   - Map visible
   - Should be < 1 second

**Record**:
- Offline load time: _____ ms
- Cached load time: _____ ms
- Improvement: _____ %

---

### Test 14: Storage Usage
**Objective**: Verify cache doesn't grow too large

**Steps**:
1. DevTools → Application → Storage → Manage
2. Find "pediatrician-locator" or similar
3. Record cache size: _____ MB
4. Should be < 5 MB

**Check Breakdown**:
- HTML/CSS/JS: ~1 MB
- Clinic data: ~500 KB
- Map tiles: ~1 MB
- Images: ~500 KB
- Total: ~3-4 MB

**Expected**: ✅ < 5 MB total

---

## ✅ Final Checklist

Run through all tests and mark complete:

- [ ] Test 1: Basic Offline Mode
- [ ] Test 2: Mobile Responsiveness
- [ ] Test 3: Service Worker Registration
- [ ] Test 4: Cache Verification
- [ ] Test 5: Offline Clinic Search
- [ ] Test 6: Offline Location Tracking
- [ ] Test 7: Offline Report Submission
- [ ] Test 8: Cache Update Cycle
- [ ] Test 9: PWA Installation
- [ ] Test 10: Mobile-Specific Features
- [ ] Test 11: Real Android Device
- [ ] Test 12: Real iOS Device
- [ ] Test 13: Load Times
- [ ] Test 14: Storage Usage

---

## 🐛 Troubleshooting During Testing

### Issue: Service Worker not registering
**Solution**:
1. Check HTTPS (required for SW)
2. Clear browser cache
3. Try different browser
4. Check console for errors

### Issue: Offline mode not working
**Solution**:
1. Ensure page loaded while online first
2. Refresh after going offline
3. Check DevTools SW status
4. Try in new private/incognito window

### Issue: Cache not appearing
**Solution**:
1. Refresh page while online
2. Check correct cache name (pedi-locator-v1)
3. Check DevTools → Application tab
4. Try clear cache → reload

### Issue: Mobile layout broken
**Solution**:
1. Refresh page
2. Check device emulation size
3. Try different device
4. Clear CSS cache (F5)

### Issue: Reports not syncing
**Solution**:
1. Verify online (check indicator)
2. Manually refresh page
3. Check browser console for errors
4. Check localStorage: `localStorage.getItem('pending-reports')`

---

## 📝 Test Report Template

```
Date: _______________
Tester: _______________
Browser: _______________
Device: _______________

Tests Passed: ____ / 14
Tests Failed: ____ / 14

Issues Found:
1. _______________
2. _______________
3. _______________

Notes:
_______________
_______________

Approval: ✅ Ready for Production
              ⚠️  Needs Fixes
              ❌ Not Ready
```

---

## 🎓 Key Things to Verify

**Offline Features**:
- [ ] Works with internet OFF
- [ ] "📵 Offline Mode" badge shows
- [ ] Cached clinic data displays
- [ ] Search functions offline
- [ ] Location tracking offline
- [ ] Reports save offline

**Mobile Features**:
- [ ] Responsive on all screen sizes
- [ ] Touch-friendly buttons (44px+)
- [ ] Landscape/portrait both work
- [ ] Works on Android Chrome
- [ ] Works on iOS Safari
- [ ] Can install as app

**PWA Features**:
- [ ] Service Worker active
- [ ] Cache populated
- [ ] Install prompt appears
- [ ] App works fullscreen
- [ ] Reports sync when online

---

**Testing Complete!** 🎉

All tests passing indicates your offline and mobile implementation is production-ready.

**Next Steps**:
1. Deploy to production
2. Monitor for errors
3. Gather user feedback
4. Share with users

---

**Last Updated**: February 17, 2026
