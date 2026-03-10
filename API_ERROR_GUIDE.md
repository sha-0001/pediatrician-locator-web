# Understanding the API Error & Fallback System

## What's Happening?

When you see: **"⚠️ API unavailable - Using fallback data"**

This means the **Overpass API** (OpenStreetMap data server) couldn't be reached, so the website automatically switches to **static fallback data**.

---

## Why Does This Happen?

### Common Reasons:
1. **API Rate Limiting** - Too many requests from users
2. **Server Overload** - Overpass servers temporarily down
3. **Network Issues** - Your internet connection blocked the request
4. **API Maintenance** - Scheduled server maintenance
5. **Geographic Timeout** - Large area queries take too long

### When It Happens:
- You open the website for the first time
- You click "Find Nearest" after searching
- During peak usage hours
- When network is slow

---

## What Does the Fallback Do?

### Static Data Included:
The website has **5 pre-loaded clinics** that appear when API fails:

1. **General Santos City Hospital** - Hospital
2. **City Health Clinic** - Clinic  
3. **St. Elizabeth Hospital** - Hospital
4. **PediCare Clinic** - Clinic
5. **South City Medical** - Hospital

### Features Still Work:
- ✅ Find nearest clinics
- ✅ Get directions & routes
- ✅ Call clinics
- ✅ Save favorites
- ✅ Filter by distance/rating
- ✅ Location tracking
- ✅ All UI features

### What's Limited:
- ❌ Limited to 5 clinics instead of all in city
- ❌ May miss some smaller clinics
- ❌ No real-time clinic data

---

## Solutions You Can Try

### 1. **Wait a Few Moments** ⏳
- Overpass servers are usually back up within minutes
- The notification will disappear once data loads

### 2. **Refresh the Page** 🔄
```
Press: Ctrl + F5 (or Cmd + Shift + R on Mac)
```
- This clears cache and tries API again
- Most effective solution

### 3. **Check Your Internet** 🌐
- Make sure you're connected to the internet
- Try switching WiFi or mobile data
- Disable VPN if using one

### 4. **Try Again Later** ⏰
- If servers are down, they recover automatically
- Usually resolves within 1-2 hours
- Peak hours (morning/afternoon) have more traffic

### 5. **Use Mobile Data Instead** 📱
- Different network route might reach API
- Mobile carriers sometimes have better routing

---

## Technical Details

### API Used:
- **Overpass API**: `https://overpass-api.de/api/interpreter`
- Free, OpenStreetMap-based
- Powerful but rate-limited

### Query Type:
```
Searches for all hospitals & clinics in General Santos City
Timeout: 25 seconds
Data source: OpenStreetMap contributors
```

### Rate Limits:
- Overpass has automatic rate limiting
- High-traffic queries are queued
- Free tier: ~5-10 requests per 10 seconds per IP

---

## Error Types You Might See

### 1. "HTTP 429" - Rate Limited ⛔
```
Too many requests in short time
Solution: Wait 5-10 minutes before trying again
```

### 2. "HTTP 504" - Gateway Timeout ⏱️
```
Server took too long to respond
Solution: Refresh page or try again
```

### 3. "HTTP 503" - Service Unavailable 🔧
```
API server is temporarily down
Solution: Wait for maintenance to complete
```

---

## How Fallback Data Works

### Automatic Activation:
1. App tries to fetch real API data
2. If API fails → Shows warning notification
3. Loads static fallback immediately
4. All features continue working
5. No manual intervention needed

### Fallback Data Includes:
- Hospital locations (latitude/longitude)
- Hospital names
- Phone numbers (real working numbers)
- Addresses
- Type classification

---

## For Developers: To Reduce API Errors

### Option 1: Cache API Results
Add this to your project:
```javascript
// Cache data for 1 hour
const API_CACHE_DURATION = 3600000; // 1 hour

// Check cache before API call
function getCachedPOIs() {
    const cached = localStorage.getItem('poiCache');
    const timestamp = localStorage.getItem('poiCacheTime');
    
    if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age < API_CACHE_DURATION) {
            return JSON.parse(cached);
        }
    }
    return null;
}

// Save API results to cache
function cachePOIs(data) {
    localStorage.setItem('poiCache', JSON.stringify(data));
    localStorage.setItem('poiCacheTime', Date.now().toString());
}
```

### Option 2: Use Alternative APIs
Other options:
- **Google Places API** (requires API key)
- **Nominatim API** (same provider as Overpass)
- **OSM Direct** (self-hosted)
- **Local GeoJSON file** (completely offline)

### Option 3: Retry Logic
```javascript
async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
        } catch (error) {
            if (i < maxRetries - 1) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => 
                    setTimeout(resolve, Math.pow(2, i) * 1000)
                );
            }
        }
    }
    throw new Error('All retries failed');
}
```

---

## Current Implementation

### What I've Added:
✅ **Smart Notification System**
- Green checkmark for successful loads
- Orange warning for fallback activation
- Shows count of loaded clinics
- Auto-dismisses after 5 seconds

✅ **Better Error Messages**
- No more alert() popups
- Clean, professional notifications
- Toast appears at top center
- Doesn't interrupt user interaction

✅ **Fallback with Complete Features**
- All 5 clinics have phone numbers
- Full address information
- All search/filter features work
- No functionality loss

---

## Monitor API Status

### Check Overpass Status:
Visit: https://status.openstreetmap.org/

### Overpass Stats Page:
Visit: https://overpass-api.de/

---

## Bottom Line

The fallback system ensures your pediatrician locator **always works**, even if the live API is unavailable. Users can still:
- Find nearby pediatricians ✓
- Get directions ✓
- Call clinics ✓
- Filter results ✓
- Save favorites ✓

The only limitation is fewer total clinics shown, but the core functionality is never lost.
