# 📐 PEDIATRICIAN LOCATOR - VISUAL ARCHITECTURE GUIDE

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PEDIATRICIAN LOCATOR v2.0                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    TOP NAVIGATION BAR                     │   │
│  │  [Logo] [Search] [Directions] [Manual Location]          │   │
│  │                  [Get My Location]                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────┬────────────────────┬────────────────────┐  │
│  │                 │                    │                    │  │
│  │  LEFT SIDEBAR   │     MAP CENTER     │   RIGHT PANEL      │  │
│  │  (280px)        │  (Interactive Map) │   (Info & Route)   │  │
│  │                 │                    │                    │  │
│  │ ┌─────────────┐ │                    │ ┌──────────────┐   │  │
│  │ │ 📍 Starting │ │                    │ │ Route & Info │   │  │
│  │ │ Point Input │ │   [Map Layers]     │ │              │   │  │
│  │ │             │ │   • 2D             │ │ • Distance   │   │  │
│  │ │ [📡 Current]│ │   • Satellite      │ │ • Duration   │   │  │
│  │ │ [🗺️ Pick]   │ │   • Terrain        │ │ • Transport  │   │  │
│  │ ├─────────────┤ │   [Zoom Controls]  │ │ • Landmarks  │   │  │
│  │ │ 🚀 Destin   │ │                    │ │ • Directions │   │  │
│  │ │ ation Input │ │   Markers:         │ │              │   │  │
│  │ │             │ │   🏥 Clinic        │ │ Transport:   │   │  │
│  │ │ [📍 Nearby] │ │   🏣 Hospital      │ │ 🚗🚶🚌🏍️   │   │  │
│  │ │ [🗺️ Pick]   │ │   📍 Your Location │ │              │   │  │
│  │ ├─────────────┤ │   ─────────────    │ │ [▶ Start]    │   │  │
│  │ │ ===Dots===  │ │   Route Line       │ │ [⏹ Stop]     │   │  │
│  │ │ (Connector) │ │   (Blue/Gray)      │ │              │   │  │
│  │ │ ───────────  │ │                    │ └──────────────┘   │  │
│  │ ├─────────────┤ │                    │                    │  │
│  │ │ 🚗 Car      │ │    [Cluster]       │ [Notification]    │  │
│  │ │ 🚶 Walk     │ │    [Marker]        │ Toast Messages    │  │
│  │ │ 🚌 Bus      │ │    [Popup]         │                    │  │
│  │ │ 🏍️ Bike     │ │                    │                    │  │
│  │ ├─────────────┤ │                    │                    │  │
│  │ │ 📊 Trip     │ │                    │                    │  │
│  │ │ Distance    │ │                    │                    │  │
│  │ │ Duration    │ │                    │                    │  │
│  │ │ Fare        │ │                    │                    │  │
│  │ ├─────────────┤ │                    │                    │  │
│  │ │ 🏥 Nearby   │ │                    │                    │  │
│  │ │ Clinic List │ │                    │                    │  │
│  │ │ (Scrollable)│ │                    │                    │  │
│  │ ├─────────────┤ │                    │                    │  │
│  │ │ 💰 Fee      │ │                    │                    │  │
│  │ │ Calculator  │ │                    │                    │  │
│  │ │ Age & Type  │ │                    │                    │  │
│  │ │ [Calculate] │ │                    │                    │  │
│  │ │ Result: ₱X  │ │                    │                    │  │
│  │ ├─────────────┤ │                    │                    │  │
│  │ │ 🗺️ Map Type │ │                    │                    │  │
│  │ │ [2D] [Sat]  │ │                    │                    │  │
│  │ │ [Terrain]   │ │                    │                    │  │
│  │ └─────────────┘ │                    │                    │  │
│  │                 │                    │                    │  │
│  └─────────────────┴────────────────────┴────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎬 User Flow Diagram

```
START
  │
  ├─→ [Load Map] ────────────────────────────────────────┐
  │        ↓                                              │
  │   [Request Location]                                 │
  │        ↓                                              │
  │   [Fetch Clinics via Overpass API]                  │
  │        ↓                                              │
  │   [Render Clinic Markers & List]                    │
  │        ↓                                              │
  ├─→ [User Interaction]                                │
  │        │                                              │
  │        ├─→ Set Starting Point                        │
  │        │      ├─ [📡 Use Current]  ──→ Auto GPS     │
  │        │      ├─ [🗺️ Pick on Map] ──→ Click & Mark  │
  │        │      └─ [Search Box]      ──→ Address      │
  │        │            ↓                                │
  │        │   startLocation = {lat, lon}               │
  │        │            ↓                                │
  │        └─→ Select Destination Clinic               │
  │               ├─ [📍 Nearby Clinics]               │
  │               │      ↓                              │
  │               │   Show 10 Closest                  │
  │               │      ↓                              │
  │               │   Click One                        │
  │               │                                     │
  │               ├─ [Search Box]                      │
  │               │      ↓                              │
  │               │   Real-time Filtering              │
  │               │                                     │
  │               └─ [🗺️ Pick on Map]                  │
  │                      ↓                              │
  │               destLocation = {lat, lon}            │
  │                      ↓                              │
  │ ┌────────────────────────────────────┐            │
  │ │                                    │             │
  │ ├─→ Select Transport Mode           │             │
  │ │   [🚗] [🚶] [🚌] [🏍️]            │             │
  │ │          ↓                         │             │
  │ │   currentTransportMode = 'car'    │             │
  │ │          ↓                         │             │
  │ │ ┌──────────────────────────────┐  │             │
  │ │ │ Calculate Route Real-time    │  │             │
  │ │ ├──────────────────────────────┤  │             │
  │ │ │ Distance = getDistance()     │  │             │
  │ │ │ Duration = distance / speed  │  │             │
  │ │ │ Fare = calculateFare()       │  │             │
  │ │ │ Route = OSRM API             │  │             │
  │ │ │ Geometry = GeoJSON Line      │  │             │
  │ │ └──────────────────────────────┘  │             │
  │ │          ↓                         │             │
  │ │ Show Results:                      │             │
  │ │ 📏 Distance: X km                 │             │
  │ │ ⏱️ Duration: X min                │             │
  │ │ 💰 Fare: ₱X                       │             │
  │ │          ↓                         │             │
  │ │ [Confirm & Get Directions]         │             │
  │ │          ↓                         │             │
  │ │ [Route Drawn on Map]               │             │
  │ │ [Map Zoomed to Fit]                │             │
  │ │                                    │             │
  │ └────────────────────────────────────┘             │
  │                                                     │
  ├─→ [Optional: Calculate Consultation Fee]           │
  │   [Select Age] → [Select Service] → [Calculate]   │
  │                      ↓                              │
  │                   Show: ₱XXX                      │
  │                                                     │
  ├─→ [Optional: Switch Transport Mode]                │
  │        ↓                                            │
  │   Re-calculate entire route                       │
  │        ↓                                            │
  │   Update Distance/Duration/Fare                   │
  │        ↓                                            │
  │   Redraw Route on Map                             │
  │                                                     │
  └─→ END (User has all info needed)
```

---

## 🎨 Color & Typography Scheme

```
┌─────────────────────────────────────────┐
│         COLOR PALETTE v2.0              │
├─────────────────────────────────────────┤
│                                          │
│  Primary Blue:    #1565c0               │
│  Used in:         Location Picker       │
│  Meaning:         Trust, Professional   │
│                                          │
│  Transport Orange: #ff5722              │
│  Used in:         Transport Buttons     │
│  Meaning:         Energy, Movement      │
│                                          │
│  Success Green:   #27ae60               │
│  Used in:         Trip Results          │
│  Meaning:         Confirmation, Go      │
│                                          │
│  Warning Golden:  #e67e22               │
│  Used in:         Calculator            │
│  Meaning:         Information, Cost     │
│                                          │
│  Neutral Gray:    #666, #999            │
│  Used in:         Secondary Text        │
│  Meaning:         Subtle, Less Important│
│                                          │
│  Dark Mode Bg:    #2a2a2a              │
│  Used in:         All sections (dark)   │
│  Meaning:         Reduced Eye Strain    │
│                                          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│       TYPOGRAPHY HIERARCHY               │
├─────────────────────────────────────────┤
│                                          │
│  Logo/Title:      20px, Bold (Roboto)  │
│  Section Headers: 14-18px, Bold        │
│  Body Text:       12-14px, Regular     │
│  Small Text:      11px, Regular        │
│  Labels:          12px, 600 weight     │
│  Placeholders:    13px, Italic         │
│                                          │
│  Font Family:     'Roboto', Arial       │
│  Line Height:     1.5                   │
│  Letter Spacing:  Normal                │
│                                          │
└─────────────────────────────────────────┘
```

---

## 📱 Responsive Breakpoints

```
Mobile-First Design
│
├─ Extra Small (< 480px)
│  ├─ Sidebar: Collapsed, hover-expand
│  ├─ Buttons: Stacked vertically
│  ├─ Text: 12px min
│  ├─ Padding: 8-12px
│  └─ Map: Full width
│
├─ Small (480px - 768px)
│  ├─ Sidebar: 280px, docked
│  ├─ Buttons: 2-column grid
│  ├─ Layout: Flexible
│  └─ Padding: 12-15px
│
├─ Medium (768px - 1024px)
│  ├─ Sidebar: 280px, always visible
│  ├─ Map: Center of screen
│  ├─ Right panel: Visible on hover
│  └─ Full layout accessible
│
└─ Large (> 1024px)
   ├─ All panels visible simultaneously
   ├─ Optimal spacing
   ├─ Full functionality
   └─ Desktop experience
```

---

## ⚙️ Data Flow Diagram

```
┌──────────────────────────────────────────────────────┐
│              INPUT DATA SOURCES                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  📍 Browser Geolocation API                          │
│     └─→ {lat, lon, accuracy}                         │
│         └─→ [User Location]                          │
│                                                       │
│  🌐 Nominatim Reverse Geocoding                      │
│     └─→ Address String                               │
│         └─→ [User Address]                           │
│                                                       │
│  🏥 Overpass API (OpenStreetMap)                     │
│     └─→ [{id, lat, lon, name, type, tags}]         │
│         └─→ [POIs Array]                             │
│                                                       │
│  🗺️ OSRM Routing Service                            │
│     └─→ {geometry, distance, duration, steps}       │
│         └─→ [Route Geometry]                         │
│                                                       │
│  💾 Browser localStorage                             │
│     └─→ {favorites, recent, theme}                  │
│         └─→ [Persistent State]                      │
│                                                       │
└──────────────────────────────────────────────────────┘
          │
          │
          ↓
┌──────────────────────────────────────────────────────┐
│         CORE APPLICATION LOGIC                        │
├──────────────────────────────────────────────────────┤
│                                                       │
│  State Management:                                   │
│  ├─ startLocation: {lat, lon}                       │
│  ├─ destLocation: {lat, lon, name, type, addr}     │
│  ├─ currentTransportMode: 'car'|'walk'|'public'|... │
│  ├─ lastKnownPosition: {lat, lon}                   │
│  ├─ pois: [{...}, ...]                              │
│  └─ userAddress: string                             │
│                                                       │
│  Calculation Functions:                             │
│  ├─ getDistance(lat1, lon1, lat2, lon2) → km       │
│  ├─ calculateFare(distance) → ₱ amount              │
│  ├─ calculateAndShowRoute() → display results      │
│  ├─ updatePediatriciansNearby(lat, lon) → render  │
│  └─ showNearbyClinicsList() → dropdown population  │
│                                                       │
│  Event Handlers:                                    │
│  ├─ Button clicks → Update state                   │
│  ├─ Input changes → Filter/search                  │
│  ├─ Map clicks → Set locations                     │
│  └─ Mode selection → Recalculate routes            │
│                                                       │
└──────────────────────────────────────────────────────┘
          │
          │
          ↓
┌──────────────────────────────────────────────────────┐
│            OUTPUT & VISUALIZATION                    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Map Display:                                        │
│  ├─ Clinic Markers (Hospital/Clinic Icons)          │
│  ├─ User Location (Blue Marker)                     │
│  ├─ Route Line (Blue/Gray Polyline)                │
│  ├─ Marker Clusters                                 │
│  └─ Popups & Info Windows                          │
│                                                       │
│  Sidebar Content:                                   │
│  ├─ Location Inputs + Dropdowns                     │
│  ├─ Transport Mode Buttons                          │
│  ├─ Trip Details Display                            │
│  ├─ Clinic List + Actions                           │
│  ├─ Fee Calculator + Results                        │
│  └─ Map Layer Selector                              │
│                                                       │
│  Right Panel Display:                               │
│  ├─ Route Summary                                   │
│  ├─ Step-by-step Directions                         │
│  ├─ Nearby Landmarks                                │
│  └─ Transport Mode Selector                         │
│                                                       │
│  User Notifications:                                │
│  ├─ Toast Messages (Success/Error/Info)            │
│  ├─ Loading States                                  │
│  ├─ Accuracy Indicators                             │
│  └─ Status Badges                                   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## 🔄 Component State Machine

```
Application States:
│
├─ INITIALIZATION
│  ├─ Load libraries (Leaflet, Leaflet MarkerCluster)
│  ├─ Initialize map
│  ├─ Request geolocation
│  ├─ Fetch POIs
│  └─ → IDLE
│
├─ IDLE (Default)
│  ├─ Map displayed
│  ├─ Clinics visible
│  ├─ Waiting for user input
│  └─ Can transition to:
│     ├─ LOCATION_INPUT (start)
│     ├─ DESTINATION_INPUT (destination)
│     ├─ ROUTE_CALCULATING
│     ├─ TRANSPORT_CHANGING
│     └─ CALCULATOR_ACTIVE
│
├─ LOCATION_INPUT
│  ├─ Focus on start location input
│  ├─ Show suggestions dropdown
│  ├─ Auto-detect or manual input
│  └─ → IDLE
│
├─ DESTINATION_INPUT
│  ├─ Focus on destination input
│  ├─ Show nearby clinics
│  ├─ Filter by search term
│  └─ → IDLE
│
├─ ROUTE_CALCULATING
│  ├─ Call OSRM API
│  ├─ Display loading state
│  ├─ Calculate distance/duration/fare
│  ├─ Render route on map
│  └─ → IDLE or TRANSPORT_CHANGING
│
├─ TRANSPORT_CHANGING
│  ├─ User selects new mode
│  ├─ Clear previous route
│  ├─ Recalculate with new mode
│  └─ → ROUTE_CALCULATING
│
└─ CALCULATOR_ACTIVE
   ├─ Age selector focused
   ├─ Service selector focused
   ├─ Calculate button clicked
   ├─ Show fee amount
   └─ → IDLE
```

---

## 📊 Data Models

```
Location Model:
{
  lat: number,
  lon: number,
  address?: string,
  accuracy?: number
}

POI Model (Point of Interest):
{
  id: number,
  lat: number,
  lon: number,
  name: string,
  type: "Hospital" | "Clinic",
  tags: {
    "addr:full"?: string,
    "addr:street"?: string,
    phone?: string,
    website?: string,
    [key]: any
  },
  distance?: number,        // Calculated
  _marker?: L.Marker        // Leaflet marker reference
}

Trip Details Model:
{
  startLocation: Location,
  destLocation: Location & {name, type, addr},
  transportMode: "car" | "walking" | "public" | "motorcycle",
  distance: number,         // km
  duration: number,         // minutes
  fare: number,             // ₱
  route: {
    geometry: GeoJSON,
    steps: Array,
    distance: number,
    duration: number
  }
}

Fee Calculation Model:
{
  ageGroup: "0-6" | "6-12" | "1-3" | "3-5" | "5-12" | "12+",
  serviceType: "checkup" | "vaccination" | "emergency" | "consultation" | "followup",
  baseFee: number,
  multipliers: {...},
  finalFee: number
}
```

---

## 🎯 Performance Optimization Strategies

```
Load Time Optimization:
├─ Minimal CSS (combined into one file)
├─ Minimal JS (compiled from modules)
├─ No unnecessary images
├─ API calls deferred until needed
├─ LocalStorage for instant favorites
└─ Total initial: ~39 KB

Runtime Optimization:
├─ Marker clustering (reduces DOM elements)
├─ Debounced search input
├─ Efficient distance calculations (Haversine)
├─ Lazy-loaded POI rendering
├─ Limited dropdown results (top 8)
├─ CSS transforms for smooth animations
└─ RAF for smooth transitions

Memory Optimization:
├─ Event delegation (single handlers)
├─ Efficient data structures (objects, maps)
├─ Proper cleanup on panel close
├─ LocalStorage size limits
└─ No memory leaks from listeners

Network Optimization:
├─ Single POI fetch on load
├─ Cached POI data
├─ Lazy API calls (OSRM on demand)
├─ Compression-friendly code
└─ Fallback for failed requests
```

---

## 📈 Scalability Considerations

```
Current Capacity:
├─ Max clinics per bbox: 50+ (automatic clustering)
├─ Map zoom levels: 1-20
├─ Supported POI types: 2 (hospital, clinic)
├─ Transport modes: 4
├─ Favorite items: Unlimited (localStorage 5MB)
└─ Recent items: Last 10 (fixed size)

Future Scaling Options:
├─ Database backend (PostgreSQL + PostGIS)
├─ Tile-based caching system
├─ Redis for real-time data
├─ CDN for map tiles
├─ Microservices for APIs
├─ GraphQL for efficient queries
└─ Real-time updates via WebSockets
```

---

**Document Version**: 2.0 | **Last Updated**: Feb 10, 2026
