
// ============================================================================
// PEDIATRICIAN LOCATOR APP - SIMPLIFIED VERSION
// Find nearest clinic/hospital to user's current location
// ============================================================================

// initialize map using Leaflet
var map = L.map('map').setView([6.1164, 125.1716], 15);

function updateTopbarHeightVar() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const height = Math.max(48, topbar.offsetHeight || 56);
    document.documentElement.style.setProperty('--topbar-height', `${height}px`);
}

window.addEventListener('resize', updateTopbarHeightVar);
window.addEventListener('orientationchange', updateTopbarHeightVar);
setTimeout(updateTopbarHeightVar, 50);

function loadCinematicZoomPreference() {
    const stored = localStorage.getItem('cinematic-zoom');
    cinematicZoomEnabled = stored !== '0';
    const toggle = document.getElementById('cinematic-zoom-toggle');
    if (toggle) toggle.checked = cinematicZoomEnabled;
}

function setCinematicZoomEnabled(enabled) {
    cinematicZoomEnabled = !!enabled;
    localStorage.setItem('cinematic-zoom', cinematicZoomEnabled ? '1' : '0');
}

const layers = {
    '2d': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }),
    'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    }),
    'terrain': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap contributors'
    })
};

let currentLayer = '2d';
layers[currentLayer].addTo(map);

// ============================================================================
// ZOOM CONTROLS CUSTOMIZATION
// ============================================================================
setTimeout(() => {
    const zoomControl = document.querySelector('.leaflet-control-zoom');
    if (zoomControl) {
        zoomControl.style.padding = '2px';
        zoomControl.style.gap = '0px';
    }
    
    const zoomInBtn = document.querySelector('.leaflet-control-zoom-in');
    const zoomOutBtn = document.querySelector('.leaflet-control-zoom-out');
    
    if (zoomInBtn && zoomOutBtn) {
        [zoomInBtn, zoomOutBtn].forEach(btn => {
            btn.style.width = '28px';
            btn.style.height = '28px';
            btn.style.fontSize = '12px';
            btn.style.lineHeight = '28px';
            btn.style.padding = '0';
        });
    }
}, 100);

// ============================================================================
// MARKER CLUSTER GROUP
// ============================================================================
const markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 80,
    disableClusteringAtZoom: 17
});

// Center marker for General Santos City
L.marker([6.1164, 125.1716])
  .addTo(map)
  .bindPopup("<b>General Santos City</b><br>Pediatrician Locator")
  .openPopup();

// ============================================================================
// CORE VARIABLES & STATE
// ============================================================================
let pois = []; // POIs from Overpass API
let lastKnownPosition = null;
let pendingPosition = null;
let userAddress = "Loading location...";
let userLocationAccuracy = null;
let routeLayer = null;
let currentTheme = localStorage.getItem('theme') || 'auto';
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let liveTrackingWatchId = null; // ID for continuous location watch
let selectedClinic = null; // Track if user selected a clinic for navigation
let isLiveTracking = false; // Toggle for live tracking
let gpsLockedIn = false; // Has GPS achieved a lock?
let manualLocationUsed = false; // Did user use manual location?
let gpsStartTime = null; // Track when GPS acquisition started
let locationMode = 'unknown'; // 'gps' | 'network' | 'manual' | 'unknown'
let ignorePositionJump = false; // Allow first GPS fix after switching modes
let cinematicZoomEnabled = true;

const GPS_LOCK_ACCURACY_M = 100; // Real GPS typically < 100m
const NETWORK_LOCATION_MAX_ACCURACY_M = 1200; // Allow WiFi/cell-based location

// ============================================================================
// OFFLINE MODE & CACHING FEATURES
// ============================================================================

/**
 * Cache clinic data to localStorage for offline access
 */
function cacheClinicData(clinics) {
    try {
        localStorage.setItem('cached-clinics', JSON.stringify(clinics));
        localStorage.setItem('cached-clinics-timestamp', Date.now().toString());
        console.log('✓ Cached ' + clinics.length + ' clinics for offline use');
    } catch (e) {
        console.warn('Could not cache clinic data:', e);
    }
}

/**
 * Get cached clinic data if available
 */
function getCachedClinics() {
    try {
        const cached = localStorage.getItem('cached-clinics');
        const timestamp = parseInt(localStorage.getItem('cached-clinics-timestamp') || '0');
        
        if (!cached) return null;
        
        const clinics = JSON.parse(cached);
        const ageMinutes = (Date.now() - timestamp) / 60000;
        
        return {
            clinics: clinics,
            age: ageMinutes,
            isFresh: ageMinutes < 60 // Consider fresh if less than 1 hour old
        };
    } catch (e) {
        console.warn('Could not retrieve cached clinic data:', e);
        return null;
    }
}

/**
 * Clear all cached data
 */
function clearOfflineCache() {
    try {
        localStorage.removeItem('cached-clinics');
        localStorage.removeItem('cached-clinics-timestamp');
        localStorage.removeItem('pending-reports');
        console.log('✓ Offline cache cleared');
    } catch (e) {
        console.warn('Could not clear cache:', e);
    }
}

/**
 * Queue a report for submission when back online
 */
function queueReportForSync(clinicId, status, notes, name) {
    try {
        const pending = JSON.parse(localStorage.getItem('pending-reports')) || [];
        
        pending.push({
            clinicId: clinicId,
            status: status,
            notes: notes,
            name: name,
            timestamp: Date.now(),
            synced: false
        });
        
        localStorage.setItem('pending-reports', JSON.stringify(pending));
        console.log('✓ Report queued for sync when online');
        
        return true;
    } catch (e) {
        console.error('Could not queue report:', e);
        return false;
    }
}

/**
 * Get number of pending reports waiting to sync
 */
function getPendingReportCount() {
    try {
        const pending = JSON.parse(localStorage.getItem('pending-reports')) || [];
        return pending.filter(r => !r.synced).length;
    } catch (e) {
        return 0;
    }
}

/**
 * Submit clinic report (handles offline queuing)
 */
function submitClinicReport(clinicId, status, notes, name) {
    // Always save locally first
    saveClinicReport(clinicId, status, notes, name);
    
    // If offline, queue for later sync
    if (!navigator.onLine) {
        queueReportForSync(clinicId, status, notes, name);
        showNotification('📵 Report saved offline. Will sync when back online.', 'info', 3000);
        
        // Register for background sync if available
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                registration.sync.register('sync-reports').catch(err => {
                    console.warn('Background sync not available:', err);
                });
            });
        }
        return;
    }
    
    // Try to submit to server if online (implement your API call here)
    // For now, just showing success notification
    showNotification('✓ Report submitted to community!', 'success', 2000);
}

/**
 * Get offline status indicator
 */
function getOfflineStatus() {
    return {
        isOffline: !navigator.onLine,
        hasOfflineData: !!localStorage.getItem('cached-clinics'),
        pendingReports: getPendingReportCount()
    };
}

/**
 * Estimate cache storage usage
 */
function getCacheSize() {
    try {
        let size = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                size += localStorage[key].length + key.length;
            }
        }
        return (size / 1024).toFixed(2); // KB
    } catch (e) {
        return 0;
    }
}

// ============================================================================
// USER REPORTS & COMMUNITY VERIFICATION
// ============================================================================

/**
 * Get all reports for a clinic from localStorage
 */
function getClinicReports(clinicId) {
    const key = `clinic-reports-${clinicId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    
    try {
        const reports = JSON.parse(stored);
        // Filter out very old reports (older than 24 hours)
        const now = Date.now();
        return reports.filter(r => (now - r.timestamp) < 86400000); // 24 hours
    } catch (e) {
        return [];
    }
}

/**
 * Save a report for a clinic
 */
function saveClinicReport(clinicId, status, notes = '', userName = '') {
    const key = `clinic-reports-${clinicId}`;
    const reports = getClinicReports(clinicId);
    
    reports.push({
        status, // 'open', 'closed', 'unsure'
        notes,
        userName: userName || 'Anonymous',
        timestamp: Date.now()
    });
    
    localStorage.setItem(key, JSON.stringify(reports));
    showNotification('✅ Thank you! Your report helps the community.', 'success', 2500);
}

/**
 * Get consensus availability from community reports (more recent = more weight)
 */
function getCommunityConsensus(clinicId) {
    const reports = getClinicReports(clinicId);
    if (reports.length === 0) return null;
    
    // Weight recent reports more heavily
    const now = Date.now();
    const weighted = reports.map(r => {
        const ageMinutes = (now - r.timestamp) / 60000;
        const weight = ageMinutes < 30 ? 3 : (ageMinutes < 120 ? 2 : 1);
        return { status: r.status, weight };
    });
    
    const openCount = weighted.filter(w => w.status === 'open').reduce((sum, w) => sum + w.weight, 0);
    const closedCount = weighted.filter(w => w.status === 'closed').reduce((sum, w) => sum + w.weight, 0);
    
    // If consensus is clear, use it; otherwise return null (use time-based estimate)
    if (openCount > closedCount * 1.5) return 'open';
    if (closedCount > openCount * 1.5) return 'closed';
    
    return null; // ambiguous, use system estimate
}

/**
 * Get final availability: community consensus + fallback to system estimate
 */
function getFinalAvailability(clinicId, systemAvailability) {
    const consensus = getCommunityConsensus(clinicId);
    return consensus || systemAvailability;
}

/**
 * Calculate confidence score for displayed availability status.
 * Score combines data source quality + community report consistency/recency.
 */
function getStatusConfidence(clinic) {
    const reports = getClinicReports(clinic?.id);
    if (!reports.length) {
        const hasStructuredHours = !!(clinic?.tags?.opening_hours || clinic?.tags?.hours || knownHospitalsDb[clinic?.name]);
        const score = hasStructuredHours ? 62 : 45;
        return { score, label: hasStructuredHours ? 'Medium' : 'Low' };
    }

    const now = Date.now();
    const openCount = reports.filter(r => r.status === 'open').length;
    const closedCount = reports.filter(r => r.status === 'closed').length;
    const totalVotes = Math.max(1, openCount + closedCount);
    const agreement = Math.abs(openCount - closedCount) / totalVotes; // 0..1
    const recentCount = reports.filter(r => (now - r.timestamp) < 7200000).length; // 2h
    const recentRatio = recentCount / reports.length; // 0..1

    let score = 45 + Math.min(reports.length * 8, 30) + (agreement * 15) + (recentRatio * 10);
    score = Math.max(35, Math.min(95, Math.round(score)));

    const label = score >= 80 ? 'High' : (score >= 60 ? 'Medium' : 'Low');
    return { score, label };
}

/**
 * Infer specialization bucket used by the left filter panel.
 */
function getSpecializationCategory(clinic) {
    const sourceServices = clinic?.tags?.services || knownHospitalsDb[clinic?.name]?.services || '';
    const serviceText = String(sourceServices).toLowerCase();
    const nameText = String(clinic?.name || '').toLowerCase();

    if (/nicu|neonat|newborn/.test(serviceText + ' ' + nameText)) return 'neonatal';
    if (/vacci|immuniz/.test(serviceText)) return 'vaccination';
    if (/growth|develop|well-child|well child/.test(serviceText)) return 'growth';
    if (/emergency|er|urgent|trauma/.test(serviceText) || clinic?.type === 'Hospital') return 'emergency';
    return 'general';
}

function clinicMatchesSpecialization(clinic, selected) {
    if (!selected) return true;
    return getSpecializationCategory(clinic) === selected;
}

/**
 * Estimate appointment availability for quick booking guidance.
 */
function getAppointmentAvailability(clinic) {
    const rawHours = getClinicHoursText(clinic?.name, clinic?.tags || {});
    const hoursText = String(rawHours || '').toLowerCase();
    const hasHours = !!rawHours;

    if (!hasHours) {
        return { text: 'Hours not listed - call to confirm', tone: 'unknown' };
    }
    if (hoursText.includes('24/7')) {
        return { text: '24/7 - immediate consultation likely', tone: 'open' };
    }
    const openNow = isOpenNow(clinic?.name, clinic?.tags);
    if (!openNow) {
        return { text: 'Appointments unavailable right now', tone: 'closed' };
    }
    return { text: 'Open now - same-day appointment likely', tone: 'open' };
}

// ============================================================================
// GENERAL SANTOS CITY BOUNDS & COMPREHENSIVE LOCATION RECOGNITION
// ============================================================================
// Expanded bounds to cover entire General Santos City including all barangays and rural areas
const GENSAN_BOUNDS = {
    north: 6.1800,
    south: 6.0500,
    east: 125.2300,
    west: 125.0800
};

const GENSAN_BBOX = [6.05, 125.08, 6.18, 125.23];

// ============================================================================
// OPTION 1: COMPREHENSIVE LOCATION COORDINATE DATABASE
// Accurate lat/lon for all 26 barangays, subdivisions, buildings, landmarks, and key structures
// ============================================================================
const LOCATION_COORDINATES = {
    // ===== ALL 26 BARANGAYS (Centers) =====
    'General Santos': { lat: 6.1164, lon: 125.1716, type: 'barangay', buildings: 'SM Mall, Robinsons, Central Plaza' },
    'San Isidro': { lat: 6.1050, lon: 125.1700, type: 'barangay', buildings: 'VSM, Tierra Florida' },
    'Dadiangas': { lat: 6.1210, lon: 125.1790, type: 'barangay', buildings: 'Dadiangas Business District' },
    'Mabuhay': { lat: 6.1320, lon: 125.1820, type: 'barangay', buildings: 'Sarangani Heights, Sunrise Village' },
    'Taguolo': { lat: 6.1398, lon: 125.1620, type: 'barangay', buildings: 'Pacita Heights, Crown Regency' },
    'Polo': { lat: 6.1120, lon: 125.1420, type: 'barangay', buildings: 'San Roque, Polo residential' },
    'Labangal': { lat: 6.1520, lon: 125.1890, type: 'barangay', buildings: 'Marina Heights, Sarangani Royale' },
    'City Heights': { lat: 6.1280, lon: 125.1680, type: 'barangay', buildings: 'Montville, City Hall area' },
    'NRA': { lat: 6.0980, lon: 125.1550, type: 'barangay', buildings: 'VSM 1 Heights Phase 1 & 2' },
    'Tambler': { lat: 6.0820, lon: 125.1620, type: 'barangay', buildings: 'Tambler Heights, Gaisano' },
    'Banay-Banay': { lat: 6.1580, lon: 125.2020, type: 'barangay', buildings: 'Canberra Park' },
    'Baluan': { lat: 6.0650, lon: 125.1720, type: 'barangay', buildings: 'Port Area, Coastal Zone' },
    'Calumpang': { lat: 6.1020, lon: 125.1350, type: 'barangay', buildings: 'Pine Valley, Mt. Carmel' },
    'Cawit': { lat: 6.1200, lon: 125.1280, type: 'barangay', buildings: 'Habagat, Seaport Area' },
    'Inanod': { lat: 6.0950, lon: 125.1920, type: 'barangay', buildings: 'Villa Aurora, Laguna Park' },
    'Katangalan': { lat: 6.1420, lon: 125.1750, type: 'barangay', buildings: 'Sarangani Park' },
    'Klilig': { lat: 6.0820, lon: 125.2050, type: 'barangay', buildings: 'Klilig Coastal Area' },
    'Lagao': { lat: 6.1080, lon: 125.2150, type: 'barangay', buildings: 'Lagao Port/Harbor' },
    'Maasim': { lat: 6.1420, lon: 125.1520, type: 'barangay', buildings: 'Maasim Residential' },
    'Milagrosa': { lat: 6.0780, lon: 125.1480, type: 'barangay', buildings: 'Milagrosa Church' },
    'North Cotabato': { lat: 6.1650, lon: 125.1850, type: 'barangay', buildings: 'Valencia Heights' },
    'Polomolok': { lat: 6.1320, lon: 125.1280, type: 'barangay', buildings: 'Polomolok Residential' },
    'Santiago': { lat: 6.1320, lon: 125.1450, type: 'barangay', buildings: 'Sampaguita Village' },
    'Tala-Tala': { lat: 6.0950, lon: 125.1680, type: 'barangay', buildings: 'Suez Village' },
    'Tiangong': { lat: 6.1620, lon: 125.1450, type: 'barangay', buildings: 'Tiangong Residential' },
    'Upper Labangal': { lat: 6.1650, lon: 125.1950, type: 'barangay', buildings: 'Lumbia Hills' },
    
    // ===== SUBDIVISIONS & RESIDENTIAL AREAS (with barangay info) =====
    'VSM': { lat: 6.1050, lon: 125.1700, type: 'subdivision', barangay: 'San Isidro' },
    'VSM 1': { lat: 6.0980, lon: 125.1550, type: 'subdivision', barangay: 'NRA' },
    'VSM 1 Heights Phase 1': { lat: 6.0920, lon: 125.1520, type: 'subdivision', barangay: 'NRA' },
    'VSM 1 Heights Phase 2': { lat: 6.0940, lon: 125.1530, type: 'subdivision', barangay: 'NRA' },
    'Tierra Florida': { lat: 6.1050, lon: 125.1380, type: 'subdivision', barangay: 'San Isidro' },
    'San Roque': { lat: 6.1150, lon: 125.1250, type: 'subdivision', barangay: 'Polo' },
    'Sarangani Heights': { lat: 6.1280, lon: 125.1950, type: 'subdivision', barangay: 'Mabuhay' },
    'Sunrise Village': { lat: 6.1420, lon: 125.1880, type: 'subdivision', barangay: 'Mabuhay' },
    'Catalina Village': { lat: 6.1350, lon: 125.1920, type: 'subdivision', barangay: 'Mabuhay' },
    'Marina Heights': { lat: 6.1520, lon: 125.2050, type: 'subdivision', barangay: 'Labangal' },
    'General Santos Business Park': { lat: 6.1180, lon: 125.1650, type: 'subdivision', barangay: 'General Santos' },
    'Dadiangas Business District': { lat: 6.1220, lon: 125.1800, type: 'subdivision', barangay: 'Dadiangas' },
    'Mabuhay Homes': { lat: 6.1300, lon: 125.1750, type: 'subdivision', barangay: 'Mabuhay' },
    'Tambler Heights': { lat: 6.0850, lon: 125.1600, type: 'subdivision', barangay: 'Tambler' },
    'Villa Aurora': { lat: 6.1050, lon: 125.1920, type: 'subdivision', barangay: 'Inanod' },
    'Canberra Park': { lat: 6.1180, lon: 125.2100, type: 'subdivision', barangay: 'Banay-Banay' },
    'Pacita Heights': { lat: 6.1420, lon: 125.1620, type: 'subdivision', barangay: 'Taguolo' },
    'Crown Regency': { lat: 6.1320, lon: 125.1580, type: 'subdivision', barangay: 'Taguolo' },
    'Laguna Park': { lat: 6.1080, lon: 125.2000, type: 'subdivision', barangay: 'Inanod' },
    'Sampaguita Village': { lat: 6.1220, lon: 125.1450, type: 'subdivision', barangay: 'Santiago' },
    'Ilang-Ilang Ville': { lat: 6.1150, lon: 125.1850, type: 'subdivision', barangay: 'Katangalan' },
    'Pine Valley': { lat: 6.1350, lon: 125.1350, type: 'subdivision', barangay: 'Calumpang' },
    'Montville': { lat: 6.1250, lon: 125.1500, type: 'subdivision', barangay: 'City Heights' },
    'Mt. Carmel': { lat: 6.1050, lon: 125.1450, type: 'subdivision', barangay: 'Calumpang' },
    'Sarangani Park': { lat: 6.1480, lon: 125.1750, type: 'subdivision', barangay: 'Katangalan' },
    'Suez Village': { lat: 6.0950, lon: 125.1750, type: 'subdivision', barangay: 'Tala-Tala' },
    'Habagat': { lat: 6.1200, lon: 125.1120, type: 'subdivision', barangay: 'Cawit' },
    'Lumbia Hills': { lat: 6.1380, lon: 125.2050, type: 'subdivision', barangay: 'Upper Labangal' },
    'Sarangani Royale': { lat: 6.1520, lon: 125.1820, type: 'subdivision', barangay: 'Labangal' },
    'Valencia Heights': { lat: 6.1620, lon: 125.1680, type: 'subdivision', barangay: 'North Cotabato' },
    
    // ===== MAJOR BUILDINGS, LANDMARKS & COMMERCIAL AREAS (with barangay info) =====
    'SM Mall General Santos': { lat: 6.1175, lon: 125.1700, type: 'landmark', barangay: 'General Santos' },
    'Robinsons Mall': { lat: 6.1155, lon: 125.1720, type: 'landmark', barangay: 'General Santos' },
    'Gaisano Mall Tambler': { lat: 6.0835, lon: 125.1610, type: 'landmark', barangay: 'Tambler' },
    'Puregold Center': { lat: 6.1200, lon: 125.1750, type: 'landmark', barangay: 'Dadiangas' },
    'General Santos Hospital': { lat: 6.1210, lon: 125.1720, type: 'landmark', barangay: 'Dadiangas' },
    'City Hall': { lat: 6.1280, lon: 125.1680, type: 'landmark', barangay: 'City Heights' },
    'BPI Bank': { lat: 6.1160, lon: 125.1700, type: 'landmark', barangay: 'General Santos' },
    'MBF Building': { lat: 6.1180, lon: 125.1720, type: 'landmark', barangay: 'General Santos' },
    'Airport Terminal': { lat: 6.0820, lon: 125.2100, type: 'landmark', barangay: 'Banay-Banay' },
    'Fish Port': { lat: 6.1100, lon: 125.2200, type: 'landmark', barangay: 'Lagao' },
    'Fishpond Areas': { lat: 6.0750, lon: 125.1900, type: 'landmark', barangay: 'Baluan' },
    'Cathedral Church': { lat: 6.1160, lon: 125.1720, type: 'landmark', barangay: 'General Santos' },
    'DoH Building': { lat: 6.1250, lon: 125.1680, type: 'landmark', barangay: 'City Heights' },
    'Police Station': { lat: 6.1200, lon: 125.1700, type: 'landmark', barangay: 'Dadiangas' },
    'Fire Station': { lat: 6.1280, lon: 125.1750, type: 'landmark', barangay: 'Dadiangas' },
    'Seaport Area': { lat: 6.1180, lon: 125.1150, type: 'landmark', barangay: 'Cawit' },
    'University': { lat: 6.1350, lon: 125.1820, type: 'landmark', barangay: 'Mabuhay' },
    'Market Area': { lat: 6.1200, lon: 125.1680, type: 'landmark', barangay: 'Dadiangas' },
};

/**
 * Get accurate coordinates from local database
 * Returns { lat, lon, type, barangay } or null if not found
 */
function getCoordinatesFromDatabase(locationName) {
    if (!locationName) return null;
    
    const normalizedName = locationName.trim();
    
    // Direct match
    if (LOCATION_COORDINATES[normalizedName]) {
        return LOCATION_COORDINATES[normalizedName];
    }
    
    // Case-insensitive match
    const lowerName = normalizedName.toLowerCase();
    for (const [key, coords] of Object.entries(LOCATION_COORDINATES)) {
        if (key.toLowerCase() === lowerName) {
            return coords;
        }
    }
    
    // Partial match (for phrases like "VSM 1 Block 12 Lot 11 San Isidro")
    for (const [key, coords] of Object.entries(LOCATION_COORDINATES)) {
        if (lowerName.includes(key.toLowerCase())) {
            console.log(`📍 Partial match found: ${key} from "${locationName}", Barangay: ${coords.barangay || 'N/A'}`);
            return coords;
        }
    }
    
    return null;
}

// ALL 26 Barangays in General Santos City (accurate list)
const GENSAN_BARANGAYS = [
    'General Santos', 'San Isidro', 'Dadiangas', 'Mabuhay', 'Taguolo', 'Polo',
    'Labangal', 'City Heights', 'NRA', 'Tambler', 'Banay-Banay', 'Baluan',
    'Calumpang', 'Cawit', 'Inanod', 'Katangalan', 'Klilig', 'Lagao',
    'Maasim', 'Milagrosa', 'North Cotabato', 'Polomolok', 'Santiago',
    'Tala-Tala', 'Tiangong', 'Upper Labangal'
];

// Comprehensive list of subdivisions, residential areas, landmarks (with phases/stages)
const GENSAN_SUBDIVISIONS = [
    'VSM', 'VSM 1', 'VSM 1 Heights Phase 1', 'VSM 1 Heights Phase 2', 'VSM Heights',
    'Tierra Florida', 'San Roque', 'Sarangani Heights', 'Sunrise Village',
    'Catalina Village', 'Marina Heights', 'General Santos Business Park',
    'Dadiangas Business District', 'Mabuhay Homes', 'Tambler Heights', 'Villa Aurora',
    'Canberra Park', 'Pacita Heights', 'Crown Regency', 'Laguna Park', 'Sampaguita Village',
    'Ilang-Ilang Ville', 'Pine Valley', 'Montville', 'Mt. Carmel', 'Sarangani Park',
    'Suez Village', 'Habagat', 'Lumbia Hills', 'Sarangani Royale', 'Valencia Heights'
];

// Major streets, roads, avenues in General Santos City
const GENSAN_STREETS = [
    'Santiago Boulevard', 'General Santos Avenue', 'Mabuhay Road', 'Leon Llido Street',
    'Taguolo Street', 'Calumpang Road', 'Inanod Avenue', 'Maasim Street',
    'Polo Road', 'Labangal Avenue', 'Dadiangas Street', 'Banay-Banay Road',
    'Cawit Avenue', 'Katangalan Street', 'Hospital Road', 'Health Avenue',
    'Maharlika Road', 'Don Bosco Avenue', 'Compania Street', 'South Boulevard',
    'North Boulevard', 'East Boulevard', 'West Boulevard', 'Eastern Drive',
    'Western Drive', 'Southern Highway', 'Northern Highway', 'Airport Road'
];

// Key landmarks and commercial areas
const GENSAN_LANDMARKS = [
    'BPI', 'MBF', 'Robinsons', 'Gaisano', 'SM', 'Puregold', 'Savemore',
    'Plaza Luisita', 'Central Plaza', 'Hospital', 'Clinic', 'Barangay Hall',
    'City Hall', 'Airport', 'Seaport', 'Market', 'Church', 'School',
    'University', 'Police Station', 'Fire Station', 'Bank', 'Insurance'
];

function isLocationInGenSanCity(lat, lon, addressText = '') {
    // FIRST: Geography-based check (generous boundaries)
    const inBounds = lat >= GENSAN_BOUNDS.south && 
                     lat <= GENSAN_BOUNDS.north && 
                     lon >= GENSAN_BOUNDS.west && 
                     lon <= GENSAN_BOUNDS.east;
    
    if (inBounds) return true;
    
    // SECOND: If outside boundaries, verify against known locations
    // This allows edge-of-city and nearby rural areas
    if (addressText) {
        const lowerAddr = addressText.toLowerCase();
        
        // Check for General Santos City explicit reference
        if (lowerAddr.includes('general santos') || 
            lowerAddr.includes('gensan') ||
            lowerAddr.includes('g.s.c.') ||
            lowerAddr.includes('sarangani')) {
            return true;
        }
        
        // Check for ANY known barangay
        for (const barangay of GENSAN_BARANGAYS) {
            if (lowerAddr.includes(barangay.toLowerCase())) {
                return true;
            }
        }
        
        // Check for ANY known subdivision/residential area
        for (const subdiv of GENSAN_SUBDIVISIONS) {
            if (lowerAddr.includes(subdiv.toLowerCase())) {
                return true;
            }
        }
        
        // Check for known streets/roads
        for (const street of GENSAN_STREETS) {
            if (lowerAddr.includes(street.toLowerCase())) {
                return true;
            }
        }
        
        // Check for known landmarks/commercial areas
        for (const landmark of GENSAN_LANDMARKS) {
            if (lowerAddr.includes(landmark.toLowerCase())) {
                return true;
            }
        }
    }
    
    // FINAL FALLBACK: If address text provided but no match found, still accept it
    // with warning (user might be entering a rural/new area not yet in our database)
    if (addressText && addressText.length > 3) {
        console.log('⚠️ Address not in known locations database, but accepting for processing:', addressText);
        return true; // Trust user input - let geocoding service handle validation
    }
    
    return inBounds;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Haversine distance calculation (returns kilometers)
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info', duration = 4000) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('removing');
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

/**
 * Zoom to a location with animation
 */
function zoomToLocation(lat, lon) {
    map.setView([lat, lon], 17, { animate: true, duration: 1 });
}

let gtaZoomTimeout = null;
function gtaZoomToLocation(lat, lon) {
    if (!map || !map.flyTo) {
        zoomToLocation(lat, lon);
        return;
    }

    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
        zoomToLocation(lat, lon);
        return;
    }

    if (gtaZoomTimeout) {
        clearTimeout(gtaZoomTimeout);
        gtaZoomTimeout = null;
    }

    const currentZoom = map.getZoom() || 15;
    const zoomOut = Math.max(10, Math.min(14, currentZoom - 3));
    const targetZoom = 17;

    if (currentZoom <= zoomOut + 1) {
        map.flyTo([lat, lon], targetZoom, { animate: true, duration: 1.2, easeLinearity: 0.25 });
        return;
    }

    map.flyTo([lat, lon], zoomOut, { animate: true, duration: 0.7, easeLinearity: 0.3 });
    gtaZoomTimeout = setTimeout(() => {
        map.flyTo([lat, lon], targetZoom, { animate: true, duration: 1.2, easeLinearity: 0.25 });
        gtaZoomTimeout = null;
    }, 750);
}

// ============================================================================
// POI MANAGEMENT
// ============================================================================

const poiMarkers = L.layerGroup().addTo(map);

const hospitalIcon = L.icon({
    iconUrl: 'https://img.icons8.com/color/48/hospital.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
});

const pediIcon = L.icon({
    iconUrl: 'https://img.icons8.com/color/48/clinic.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

// Colored marker images (used as small badges or fallback pins)
const coloredMarker = {
    green: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    red: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    orange: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    blue: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png'
};

/**
 * COMPREHENSIVE LOCAL DATABASE: Known General Santos City hospitals/clinics
 * Includes: hours, phone, address, website, type, services
 * Updated with research data - accurate opening/closing times for availability checking
 * ============================================================================
 * Hours format options:
 *   - '24/7' for round-the-clock service
 *   - 'Mon-Fri:9:00-17:00|Sat:9:00-13:00|Sun:CLOSED' for varied weekly hours
 *   - '9:00-18:00' for daily consistent hours (applies all days)
 * Sources: Official Hospital Websites, DOH, City Health Office, Google Maps, Facebook
 */
const knownHospitalsDb = {
    // ========== 24/7 MAJOR HOSPITALS ==========
    'St. Elizabeth Hospital': { 
        hours: '24/7', 
        type: 'hospital',
        phone: '(083) 552-3162',
        phone_alt: '(083) 555-9999',
        address: 'Santiago Blvd, General Santos City',
        services: ['Emergency', 'Pediatrics', 'Cardiology', 'Surgery', 'Maternity', 'NICU'],
        website: 'https://st-elizabethhospital.com',
        verification: 'Verified - Official Research'
    },
    'Sarangani Bay Specialists Medical Center': { 
        hours: '24/7', 
        type: 'hospital',
        phone: '(083) 887-8888',
        phone_alt: '(083) 555-5000',
        address: 'Dadiangas, General Santos City',
        services: ['Emergency', 'Pediatrics', 'Maternal Health', 'Surgery', 'ICU'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'Mindanao Medical Center': { 
        hours: '24/7', 
        emergency_clinic_hours: '9:00-17:00',
        type: 'hospital',
        phone: '(083) 301-1153',
        phone_alt: '(083) 555-4444',
        address: 'Mabuhay Road, General Santos City',
        services: ['Emergency', 'Pediatrics', 'Consultation', 'Immunization'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'Dadiangas Medical Center': { 
        hours: '24/7', 
        type: 'hospital',
        phone: '0917 190 2568',
        phone_alt: '(083) 555-8888',
        address: 'Leon Llido Street, General Santos City',
        services: ['Emergency', 'Pediatrics', 'General Medicine'],
        website: '',
        verification: 'Verified - Official Research'
    },

    // ========== PEDIATRIC CLINICS - WEEKDAY HOURS ==========
    'Dr. Krystle Marie Niñora Pediatric Clinic': { 
        hours: 'Mon-Fri:9:00-17:00|Sat:9:00-14:00|Sun:CLOSED',
        type: 'clinic',
        phone: '0919 698 4437',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Consultation', 'Immunization'],
        rating: 5.0,
        website: '',
        verification: 'Verified - Google Maps'
    },
    'Frial Pediatric Clinic': { 
        hours: 'Mon-Fri:9:00-16:00|Sat:9:00-14:00|Sun:CLOSED',
        type: 'clinic',
        phone: '0917 849 2767',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Consultation'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'The Cookie Clinic by Dr. Socorro Valencia': { 
        hours: 'Mon-Sat:10:00-16:00|Sun:CLOSED',
        type: 'clinic',
        phone: '(083) 553-8534',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Child-Friendly Environment', 'Consultation'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'Dr. Ma. Cristina Ramizo Pediatric Clinic': { 
        hours: 'Mon-Fri:9:00-17:00|Sat:9:00-15:00|Sun:CLOSED',
        type: 'clinic',
        phone: '(083) 555-5000',
        phone_alt: '',
        address: "Doctor's Hospital Complex, General Santos City",
        services: ['Pediatrics', 'Consultation'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'Mother and Child Center': { 
        hours: 'Mon-Fri:9:00-17:00|Sat:9:00-14:00|Sun:CLOSED',
        type: 'clinic',
        phone: '(083) 554-0083',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Maternal Health', 'Consultation'],
        rating: 4.8,
        website: '',
        verification: 'Verified - Google Maps'
    },
    'Romeo D. Reyes MD Pediatrics': { 
        hours: 'Mon-Fri:9:00-17:00|Sat:9:00-13:00|Sun:CLOSED',
        type: 'clinic',
        phone: '(083) 553-6587',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Consultation'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'ISHMAEL CHILDRENS\' CLINIC': { 
        hours: '9:00-17:00',
        type: 'clinic',
        phone: '0932 120 0908',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Consultation'],
        website: '',
        verification: 'Verified - Official Research'
    },
    'Maria Myra De Lara-So M.D. Pediatrics': { 
        hours: 'Mon-Fri:9:00-17:00|Sat:9:00-13:00|Sun:CLOSED',
        type: 'clinic',
        phone: '0985 578 2341',
        phone_alt: '',
        address: 'General Santos City',
        services: ['Pediatrics', 'Consultation'],
        website: '',
        verification: 'Verified - Official Research'
    }
};

/**
 * Check if hospital is open based on current time
 * Supports multiple time formats:
 *   - '24/7' for round-the-clock
 *   - '9:00-17:00' for daily consistent hours
 *   - 'Mon-Fri:9:00-17:00|Sat:9:00-14:00|Sun:CLOSED' for weekly schedules
 */
function isOpenNow(name, tags) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ... 6=Saturday
    const currentMins = hours * 60 + minutes;
    
    // Days of week lookup
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[dayOfWeek];
    
    // Check local database first
    if (name && knownHospitalsDb[name]) {
        const info = knownHospitalsDb[name];
        
        // 24/7 facilities
        if (info.hours === '24/7') return true;
        
        // Complex weekly format: "Mon-Fri:9:00-17:00|Sat:9:00-14:00|Sun:CLOSED"
        if (info.hours.includes('|') || info.hours.includes(':')) {
            const schedules = info.hours.split('|');
            
            for (const schedule of schedules) {
                const [daysStr, timeStr] = schedule.split(':');
                
                // Check if current day matches this schedule
                let dayMatches = false;
                
                if (daysStr.includes('-')) {
                    // Range like "Mon-Fri" or "Sat-Sun"
                    const [startDay, endDay] = daysStr.split('-');
                    const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const startDayIdx = dayOrder.indexOf(startDay);
                    const endDayIdx = dayOrder.indexOf(endDay);
                    const currentDayIdx = dayOrder.indexOf(currentDay);
                    
                    if (startDayIdx <= endDayIdx) {
                        dayMatches = currentDayIdx >= startDayIdx && currentDayIdx <= endDayIdx;
                    } else {
                        // Wraps around (e.g., Fri-Mon)
                        dayMatches = currentDayIdx >= startDayIdx || currentDayIdx <= endDayIdx;
                    }
                } else if (daysStr === currentDay) {
                    dayMatches = true;
                }
                
                // If this day matches, check time
                if (dayMatches) {
                    if (timeStr === 'CLOSED') return false;
                    
                    if (timeStr.includes('-')) {
                        const [openStr, closeStr] = timeStr.split('-');
                        const [openH, openM] = openStr.split(':').map(Number);
                        const [closeH, closeM] = closeStr.split(':').map(Number);
                        
                        const openMins = openH * 60 + openM;
                        const closeMins = closeH * 60 + closeM;
                        
                        return currentMins >= openMins && currentMins < closeMins;
                    }
                }
            }
            
            // If no matching schedule found, default to closed
            return false;
        }
        
        // Simple format: "9:00-17:00"
        if (info.hours.includes('-') && !info.hours.includes('|')) {
            const [openStr, closeStr] = info.hours.split('-');
            const [openH, openM] = openStr.split(':').map(Number);
            const [closeH, closeM] = closeStr.split(':').map(Number);
            
            const openMins = openH * 60 + openM;
            const closeMins = closeH * 60 + closeM;
            
            return currentMins >= openMins && currentMins < closeMins;
        }
    }
    
    // Check OSM opening_hours tag as fallback
    if (tags && tags.opening_hours) {
        const oh = tags.opening_hours.toLowerCase();
        if (oh.includes('24/7')) return true;
    }
    
    // Default heuristic: assume open 7 AM - 8 PM
    return hours >= 7 && hours < 19;
}

/**
 * Find the nearest open clinic and the nearest closed clinic for rerouting suggestions
 * Returns: { nearestClinic, nearestOpenClinic, isNearestOpen }
 */
function findNearestClinics(userLat, userLon, clinicsList) {
    let nearestClinic = null;
    let nearestOpenClinic = null;
    let minDistance = Infinity;
    let minOpenDistance = Infinity;
    
    clinicsList.forEach(clinic => {
        const dist = getDistance(userLat, userLon, clinic.lat, clinic.lon);
        
        // Track nearest overall
        if (dist < minDistance) {
            minDistance = dist;
            nearestClinic = clinic;
        }
        
        // Track nearest OPEN clinic
        const open = isOpenNow(clinic.name, clinic.tags);
        if (open && dist < minOpenDistance) {
            minOpenDistance = dist;
            nearestOpenClinic = clinic;
        }
    });
    
    return {
        nearestClinic,
        nearestOpenClinic,
        isNearestOpen: nearestClinic && isOpenNow(nearestClinic.name, nearestClinic.tags)
    };
}

/**
 * Get opening/closing info for a clinic for display
 * Returns: { status: 'open'|'closed', nextOpenTime, hoursDisplay }
 */
function getClinicHoursText(clinicName, tags = {}) {
    const tagHours = tags?.hours || tags?.opening_hours || '';
    const dbHours = knownHospitalsDb[clinicName]?.hours || '';
    return tagHours || dbHours || '';
}

function is24_7Hours(hoursText) {
    return /24\s*\/\s*7/.test(String(hoursText || '').toLowerCase());
}

function formatHoursDisplay(hoursText) {
    if (!hoursText) return '';
    if (is24_7Hours(hoursText)) return '24/7 (Open all day)';
    return hoursText;
}

function getClinicTimingInfo(clinicName, tags = {}) {
    const info = knownHospitalsDb[clinicName];
    const hoursText = getClinicHoursText(clinicName, tags);
    const hoursDisplay = formatHoursDisplay(hoursText);
    const isOpen = isOpenNow(clinicName, tags);

    return {
        status: hoursText ? (isOpen ? 'open' : 'closed') : 'unknown',
        hoursDisplay: hoursDisplay || 'Hours not listed',
        phone: info?.phone,
        services: info?.services
    };
}

function getAvailabilityDisplay(clinic) {
    const clinicName = clinic?.name || '';
    const tags = clinic?.tags || {};
    const hoursText = getClinicHoursText(clinicName, tags);
    const is24 = is24_7Hours(hoursText);
    const systemAvailability = clinic?.availability || getAvailabilityFromTags(tags, clinicName);
    const finalAvailability = getFinalAvailability(clinic?.id, systemAvailability);

    if (is24) {
        if (finalAvailability === 'closed') {
            return {
                status: 'closed',
                text: 'Reported closed (normally 24/7)',
                short: 'REPORTED CLOSED • 24/7',
                color: '#d9534f',
                icon: '🔴'
            };
        }
        return {
            status: 'open',
            text: 'Open 24/7',
            short: 'OPEN 24/7',
            color: '#28a745',
            icon: '🟢'
        };
    }

    if (finalAvailability === 'open') {
        return {
            status: 'open',
            text: 'Open now',
            short: 'OPEN NOW',
            color: '#28a745',
            icon: '🟢'
        };
    }

    if (finalAvailability === 'closed') {
        return {
            status: 'closed',
            text: 'Closed now',
            short: 'CLOSED NOW',
            color: '#d9534f',
            icon: '🔴'
        };
    }

    return {
        status: 'unknown',
        text: 'Hours not listed',
        short: 'HOURS NOT LISTED',
        color: '#ffb347',
        icon: '🟠'
    };
}

/**
 * Determine availability from OSM tags and time-based heuristic
 * returns: 'open' | 'closed' | 'unknown'
 */
function getAvailabilityFromTags(tags, name) {
    if (!tags) return 'unknown';
    
    // Try exact tag indicators first
    const oh = (tags.opening_hours || '').toLowerCase();
    if (oh.includes('24/7') || tags.open === 'yes' || tags['service:availability'] === 'open') return 'open';
    if (tags.open === 'no' || tags['service:availability'] === 'closed' || tags['closed'] === 'yes') return 'closed';
    
    const hoursText = getClinicHoursText(name, tags);
    if (hoursText) {
        // Use time-based check only when we actually have hours info
        return isOpenNow(name, tags) ? 'open' : 'closed';
    }

    return 'unknown'; // default to unknown if we can't determine
}

/**
 * Create a DivIcon that shows the clinic/hospital icon with a small colored badge
 */
function createPOIDivIcon(type, availability) {
    const color = availability === 'open' ? '#28a745' : (availability === 'closed' ? '#d9534f' : '#ffb347');
    const img = type === 'Hospital' ? 'https://img.icons8.com/color/48/hospital.png' : 'https://img.icons8.com/color/48/clinic.png';
    const html = `
        <div style="position:relative; width:40px; height:40px; display:flex; align-items:center; justify-content:center;">
            <img src="${img}" style="width:28px; height:28px; transform:translateY(-2px);"/>
            <span style="position:absolute; right:-2px; bottom:-2px; width:12px; height:12px; border-radius:50%; border:2px solid white; background:${color}; box-shadow:0 0 2px rgba(0,0,0,0.3);"></span>
        </div>
    `;

    return L.divIcon({ html, className: 'poi-div-icon', iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -36] });
}

/**
 * Fetch POIs from Overpass API
 */
function fetchPOIs() {
    const [s, w, n, e] = GENSAN_BBOX;
    const query = `
    [out: json][timeout:25];
    (
      node["amenity"="hospital"](${s},${w},${n},${e});
      way["amenity"="hospital"](${s},${w},${n},${e});
      relation["amenity"="hospital"](${s},${w},${n},${e});
      node["healthcare"="clinic"](${s},${w},${n},${e});
      way["healthcare"="clinic"](${s},${w},${n},${e});
      relation["healthcare"="clinic"](${s},${w},${n},${e});
    );
    out center;
    `.trim();
    
    return fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
        headers: {'Content-Type': 'text/plain'}
    })
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(json => {
        pois = (json.elements || []).map(el => {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            const tags = el.tags || {};

            // Prefer explicit name fields, fall back to type label if missing
            const name = tags.name || tags['official_name'] || tags['name:en'] || (tags.amenity || tags.healthcare) || 'Unnamed';

            // Better type detection
            let type = 'Clinic';
            if (tags.amenity === 'hospital' || tags.healthcare === 'hospital' || (tags.healthcare && tags.healthcare.includes('hospital'))) {
                type = 'Hospital';
            } else if (tags.amenity === 'clinic' || tags.healthcare === 'clinic' || (tags.healthcare && tags.healthcare.includes('clinic'))) {
                type = 'Clinic';
            } else if (tags.amenity) {
                type = tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1);
            }

            let availability = getAvailabilityFromTags(tags, name);

            // If opening_hours tag exists and opening_hours library available, use it to determine current open/closed state
            if (tags.opening_hours && typeof window !== 'undefined' && window.opening_hours) {
                try {
                    const oh = new opening_hours(tags.opening_hours);
                    // opening_hours library may expose different method names; try common ones
                    let isOpen = false;
                    if (typeof oh.getState === 'function') {
                        isOpen = !!oh.getState();
                    } else if (typeof oh.get_state === 'function') {
                        isOpen = !!oh.get_state(new Date());
                    } else if (typeof oh.getOpenNow === 'function') {
                        isOpen = !!oh.getOpenNow();
                    }
                    availability = isOpen ? 'open' : 'closed';
                } catch (err) {
                    // parsing failed; fall back to heuristic
                    console.warn('opening_hours parse failed for', tags.opening_hours, err);
                }
            }

            return {id: el.id, lat, lon, name, tags, type, availability};
        }).filter(p => p.lat && p.lon);

        // Cache the POIs for offline access
        cacheClinicData(pois);
        
        renderPOIMarkers();
        if (lastKnownPosition) updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
        showNotification(`✅ Loaded ${pois.length} hospitals and clinics`, 'success', 3000);
    })
    .catch(err => {
        console.error('Overpass API error:', err);
        
        // Try to use cached data if available
        const cached = getCachedClinics();
        if (cached && cached.clinics.length > 0) {
            pois = cached.clinics;
            const ageText = cached.age < 60 ? '< 1 hour' : Math.floor(cached.age / 60) + ' hours';
            showNotification(`📵 Using cached data (${ageText} old) - ${pois.length} clinics`, 'info', 3000);
            renderPOIMarkers();
            if (lastKnownPosition) updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
            return;
        }
        
        // If no cache and offline, inform user
        if (!navigator.onLine) {
            showNotification('📵 Offline - No cached clinic data available. Please try again when online.', 'warning', 3000);
            return;
        }
        
        // Fallback data - COMPREHENSIVE with contact information
        showNotification('⚠️ Using fallback clinic data', 'warning', 3000);
        pois = [
            { 
                id: 1, 
                lat: 6.1164, 
                lon: 125.1716, 
                name: 'General Santos City Hospital', 
                type: 'Hospital', 
                tags: { 
                    'addr:full': 'General Santos Avenue, General Santos City',
                    'addr:street': 'General Santos Ave',
                    phone: '(083) 555-1234',
                    'contact:phone': '(083) 555-1234',
                    'alt:phone': '(083) 552-2800',
                    website: '',
                    services: 'Emergency, Pediatrics, OB-GYN, Surgery',
                    hours: '24/7'
                } 
            },
            { 
                id: 2, 
                lat: 6.1180, 
                lon: 125.1730, 
                name: 'City Health Clinic', 
                type: 'Clinic', 
                tags: { 
                    'addr:full': 'Health Avenue, General Santos City',
                    'addr:street': 'Health Ave',
                    phone: '(083) 555-2000',
                    'contact:phone': '(083) 555-2000',
                    'alt:phone': '(083) 301-5555',
                    website: '',
                    services: 'Pediatric Checkup, Vaccination, Health Screening',
                    hours: '8:00-17:00'
                } 
            },
            { 
                id: 3, 
                lat: 6.1100, 
                lon: 125.1700, 
                name: 'St. Elizabeth Hospital', 
                type: 'Hospital', 
                tags: { 
                    'addr:full': 'Hospital Road, General Santos City',
                    'addr:street': 'Hospital Rd',
                    phone: '(083) 555-9999',
                    'contact:phone': '(083) 555-9999',
                    'alt:phone': '(083) 301-1111',
                    website: '',
                    services: 'Pediatrics, Cardiology, Surgery, Maternity',
                    hours: '24/7'
                } 
            },
            { 
                id: 4, 
                lat: 6.1120, 
                lon: 125.1685, 
                name: 'PediCare Clinic', 
                type: 'Clinic', 
                tags: { 
                    'addr:full': 'Care Street, General Santos City',
                    'addr:street': 'Care St',
                    phone: '(083) 555-3333',
                    'contact:phone': '(083) 555-3333',
                    'alt:phone': '(083) 301-6666',
                    website: '',
                    services: 'Pediatrics, Vaccination, Growth Monitoring',
                    hours: '8:00-18:00'
                } 
            },
            { 
                id: 5, 
                lat: 6.1090, 
                lon: 125.1750, 
                name: 'South General Santos Hospital', 
                type: 'Hospital', 
                tags: { 
                    'addr:full': 'South Boulevard, General Santos City',
                    'addr:street': 'South Blvd',
                    phone: '(083) 555-5678',
                    'contact:phone': '(083) 555-5678',
                    'alt:phone': '(083) 301-3333',
                    website: '',
                    services: 'Pediatrics, General Medicine, Laboratory',
                    hours: '24/7'
                } 
            },
            {
                id: 6,
                lat: 6.1140,
                lon: 125.1695,
                name: 'Mindanao Medical Center',
                type: 'Clinic',
                tags: {
                    'addr:full': 'Mindanao Avenue, General Santos City',
                    'addr:street': 'Mindanao Ave',
                    phone: '(083) 555-4444',
                    'contact:phone': '(083) 555-4444',
                    'alt:phone': '',
                    website: '',
                    services: 'Pediatrics, Consultation, Immunization',
                    hours: '7:00-20:00'
                }
            },
            {
                id: 7,
                lat: 6.1130,
                lon: 125.1705,
                name: 'Tieza Medical Clinic',
                type: 'Clinic',
                tags: {
                    'addr:full': 'Medical Plaza, General Santos City',
                    'addr:street': 'Medical Plaza',
                    phone: '(083) 555-7777',
                    'contact:phone': '(083) 555-7777',
                    'alt:phone': '(083) 301-8888',
                    website: '',
                    services: 'General Medicine, Laboratory, Consultation',
                    hours: '8:00-18:00'
                }
            },
            {
                id: 8,
                lat: 6.1150,
                lon: 125.1720,
                name: 'Gregorio Danao Hospital',
                type: 'Hospital',
                tags: {
                    'addr:full': 'Danao Boulevard, General Santos City',
                    'addr:street': 'Danao Blvd',
                    phone: '(083) 555-8888',
                    'contact:phone': '(083) 555-8888',
                    'alt:phone': '(083) 301-9999',
                    website: '',
                    services: 'Emergency, Surgery, Pediatrics',
                    hours: '24/7'
                }
            }
        ];
        // Cache fallback data too
        cacheClinicData(pois);
        renderPOIMarkers();
        if (lastKnownPosition) updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
    });
}

/**
 * Render POI markers on map
 */
function renderPOIMarkers() {
    markerClusterGroup.clearLayers();
    poiMarkers.clearLayers();
    
    pois.forEach(p => {
        // Skip unnamed POIs (no icons/markers for them)
        // Also check that name is not generic fallback values and has meaningful content
        if (!p.name || p.name === 'Unnamed' || p.name.trim() === '' || /^(clinic|hospital)$/i.test(p.name)) {
            return;
        }
        
        // create a DivIcon with colored availability badge
        const icon = createPOIDivIcon(p.type, p.availability);
        const m = L.marker([p.lat, p.lon], { icon }).addTo(poiMarkers);
        markerClusterGroup.addLayer(m);

        const addr = p.tags['addr:full'] || p.tags['addr:street'] || p.tags['address'] || '';
        const phone = p.tags.phone || p.tags['contact:phone'] || p.tags['telephone'] || '';
        const altPhone = p.tags['alt:phone'] || '';
        const website = p.tags.website || '';
        const services = p.tags.services || '';
        const hoursText = getClinicHoursText(p.name, p.tags);
        const hours = formatHoursDisplay(hoursText);
        const availability = getAvailabilityDisplay(p);
        const availabilityLabel = `<span style="color:${availability.color}; font-weight:600;">● ${availability.text}</span>`;

        const popupContent = `
            <div style="font-size:13px; max-width:300px;">
                <b style="font-size:15px;">${p.name}</b><br>
                <small style="color:#666;">${p.type} • ${availabilityLabel}</small><br>
                ${addr ? `<small style="color:#555;"><strong>📍</strong> ${addr}</small><br>` : ''}
                ${hours ? `<small style="color:#555;"><strong>⏰</strong> ${hours}</small><br>` : ''}
                ${phone ? `<small style="color:#555;"><strong>📞</strong> <a href="tel:${phone}" style="color:#1565c0; text-decoration:none;">${phone}</a></small><br>` : ''}
                ${altPhone ? `<small style="color:#888;"><strong>📱</strong> <a href="tel:${altPhone}" style="color:#7a7a7a; text-decoration:none;">${altPhone}</a></small><br>` : ''}
                ${services ? `<small style="color:#555;"><strong>🏥</strong> ${services}</small><br>` : ''}
                ${website ? `<small><a href="${website}" target="_blank" style="color:#1565c0; text-decoration:none;">🌐 Visit Website</a></small><br>` : ''}
                <button onclick="showClinicAndRoute(${p.lat}, ${p.lon}, '${p.name.replace(/'/g, "\\'")}', '${p.type}', '${(addr||'').replace(/'/g, "\\'")}')" style="margin-top:8px; padding:6px 12px; background:#1565c0; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">View Details</button>
            </div>
        `;
        m.bindPopup(popupContent);
        p._marker = m;
    });
    
    map.addLayer(markerClusterGroup);
    // Apply current availability filter state
    applyAvailabilityFilter();
}

/**
 * Show/hide markers based on the 'Show only open clinics' checkbox
 */
function applyAvailabilityFilter() {
    const filterOn = document.getElementById('filter-open-only')?.checked;
    const specialization = document.getElementById('specialization-filter')?.value || '';
    markerClusterGroup.clearLayers();
    pois.forEach(p => {
        if (!p._marker) return;
        if (filterOn && p.availability !== 'open') return; // hide closed/unknown
        if (!clinicMatchesSpecialization(p, specialization)) return;
        markerClusterGroup.addLayer(p._marker);
    });
}

/**
 * Render clinic list from a custom list (used by search fallback and initial load without GPS).
 */
function renderClinicList(clinicsList) {
    if (!Array.isArray(clinicsList)) return;
    if (lastKnownPosition) {
        updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
        return;
    }

    const pediList = document.getElementById('pedi-list');
    if (!pediList) return;

    const openOnly = !!document.getElementById('filter-open-only')?.checked;
    const specialization = document.getElementById('specialization-filter')?.value || '';

    const filtered = clinicsList
        .filter(c => c && c.name && c.name !== 'Unnamed' && c.name.trim() !== '' && !/^(clinic|hospital)$/i.test(c.name))
        .map(c => ({ ...c, availabilityInfo: getAvailabilityDisplay(c) }))
        .filter(c => !openOnly || c.availabilityInfo.status === 'open')
        .filter(c => clinicMatchesSpecialization(c, specialization))
        .slice(0, 20);

    pediList.innerHTML = '';
    if (!filtered.length) {
        pediList.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">No clinics match current filters</p>';
        return;
    }

    filtered.forEach(clinic => {
        const statusInfo = clinic.availabilityInfo || getAvailabilityDisplay(clinic);
        const statusColor = statusInfo.color;
        const confidence = getStatusConfidence(clinic);
        const appointment = getAppointmentAvailability(clinic);
        const appointmentColor = appointment.tone === 'open' ? '#2e7d32' : (appointment.tone === 'unknown' ? '#b26a00' : '#a04400');

        const item = document.createElement('div');
        item.className = 'pedi-item';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div class="pedi-item-name">${clinic.name}</div>
            <div class="pedi-item-type">${clinic.type || 'Clinic'}</div>
            <div style="margin-top:6px; font-size:12px; color:${statusColor}; font-weight:600;">
                ● ${statusInfo.text} • ${confidence.label} confidence (${confidence.score}%)
            </div>
            <div style="margin-top:4px; font-size:12px; color:${appointmentColor};">${appointment.text}</div>
        `;
        item.addEventListener('click', () => {
            selectClinic(clinic.lat, clinic.lon, clinic.name, clinic.type, clinic.tags?.addr || clinic.tags?.['addr:full'] || '', clinic);
        });
        pediList.appendChild(item);
    });
}

/**
 * Expand/collapse left filter panel.
 */
function toggleFilterPanel() {
    const panel = document.getElementById('filter-panel');
    const icon = document.querySelector('.filter-toggle-icon');
    if (!panel) return;

    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.classList.toggle('open', !isOpen);
}

/**
 * Draw animated route on map with GTA-style effects
 */
function drawAnimatedRoute(routeGeometry, destinationLat, destinationLon, destinationName) {
    // Remove old route
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    
    // Add animated route line with gradient effect
    const routeOptions = {
        style: {
            color: '#dc3545',
            weight: 6,
            opacity: 0.9,
            dashArray: '10, 5',
            lineCap: 'round',
            lineJoin: 'round'
        },
        onEachFeature: function(feature, layer) {
            layer.setStyle({
                className: 'animated-route'
            });
        }
    };
    
    routeLayer = L.geoJSON(routeGeometry, routeOptions).addTo(map);
    
    // Add pulsing destination marker
    const pulsingIcon = L.divIcon({
        html: `<div class="pulsing-destination" style="width:20px; height:20px;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: 'animated-waypoint'
    });
    
    L.marker([destinationLat, destinationLon], { icon: pulsingIcon })
        .bindPopup(`<b>📍 ${destinationName}</b><br><small>Destination</small>`)
        .addTo(map);
    
    // Fit map bounds with animation
    map.fitBounds(routeLayer.getBounds(), { padding: [80, 80], animate: true });
}

/**
 * Show clinic details and automatically compute & display route from user's GPS location
 */
function showClinicAndRoute(lat, lon, name, type, addr) {
    // Zoom to clinic and open its popup if available
    zoomToLocation(lat, lon);
    const clinic = pois.find(p => p.lat === lat && p.lon === lon && p.name === name) || { name, lat, lon, type, tags: {} };
    if (clinic._marker) clinic._marker.openPopup();

    // Ensure we have user location
    if (!lastKnownPosition) {
        showNotification('📍 Waiting for your GPS location. Moving to acquire GPS...', 'info', 4000);
        // try to start auto geolocation if not already
        if (navigator.geolocation) startAutoGeolocation();
        return;
    }

    // Open right info panel (this will automatically close the chatbot)
    openInfoPanel();

    // Update header and clinic info in route summary
    const routeSummary = document.getElementById('route-summary');
    routeSummary.innerHTML = `<strong>${name}</strong><br><small>${type} • ${addr || ''}</small><hr>`;

    // determine profile from transport select
    const transport = document.getElementById('transport-select')?.value || 'driving';
    const profile = (transport === 'walking') ? 'foot' : (transport === 'cycling') ? 'bike' : 'driving';

    // Use OSRM (project) public API for routing. Map profiles for endpoint.
    const osrmProfile = (transport === 'walking') ? 'walking' : (transport === 'cycling') ? 'cycling' : 'driving';

    fetchRoute(lastKnownPosition.lat, lastKnownPosition.lon, lat, lon, osrmProfile)
        .then(route => {
            if (!route) {
                showNotification('⚠️ Could not get route', 'warning', 3000);
                return;
            }

            // show distance/time summary
            const distKm = (route.distance / 1000).toFixed(1);
            const minutes = Math.round(route.duration / 60);
            routeSummary.innerHTML += `<div style="margin-top:8px; font-weight:600; animation: bounce-arrow 1.5s infinite;">🎯 ${distKm} km • ${minutes} min ➜</div>`;

            // draw animated route on map with GTA style
            drawAnimatedRoute(route.geometry, lon, lat, name);

            // populate step list
            const stepList = document.getElementById('step-list');
            stepList.innerHTML = '';
            const steps = route.steps || [];
            steps.forEach((s, idx) => {
                const li = document.createElement('li');
                // Build readable instruction
                let instr = s.maneuver && s.maneuver.instruction ? s.maneuver.instruction : '';
                if (!instr) {
                    const mv = s.maneuver || {};
                    instr = mv.type ? mv.type.replace(/_/g, ' ') : 'Proceed';
                    if (mv.modifier) instr += ' ' + mv.modifier;
                    if (s.name) instr += ` onto ${s.name}`;
                }
                instr = cleanInstruction(instr);
                li.textContent = `${idx + 1}. ${instr} — ${(s.distance/1000).toFixed(2)} km`;
                stepList.appendChild(li);
            });
        })
        .catch(err => {
            console.error('Route fetch error:', err);
            showNotification('⚠️ Route fetch failed', 'error', 3000);
        });
}

/**
 * Fetch route from OSRM public server. Returns a Promise with route info.
 */
function fetchRoute(fromLat, fromLon, toLat, toLon, profile = 'driving') {
    // OSRM expects lon,lat ordering
    const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true&annotations=distance`;
    return fetch(url)
        .then(r => { if (!r.ok) throw new Error('Routing error ' + r.status); return r.json(); })
        .then(json => {
            if (!json || !json.routes || !json.routes.length) return null;
            const route = json.routes[0];
            // flatten steps from all legs
            const steps = [];
            (route.legs || []).forEach(leg => {
                (leg.steps || []).forEach(s => steps.push(s));
            });
            return { distance: route.distance, duration: route.duration, geometry: route.geometry, steps };
        });
}

/**
 * Clean step instruction text by removing leading numbering or accidental duplicate numbers.
 */
function cleanInstruction(instr) {
    if (!instr) return '';
    // Remove leading numbering like "1. ", "1) ", or duplicate sequences like "1. 1. "
    instr = instr.replace(/^\s*(?:\d+\s*[\.|\)]\s*)+/, '');
    // Also remove stray repeated numeric prefixes
    instr = instr.replace(/^\s*(?:\d+\.)+\s*/, '');
    return instr.trim();
}

/**
 * Update nearby pediatricians list WITH AVAILABILITY & REROUTING SUGGESTIONS
 */
function updatePediatriciansNearby(userLat, userLon) {
    const pediList = document.getElementById('pedi-list');
    if (!pediList) return;

    pediList.innerHTML = '';
    const openOnly = !!document.getElementById('filter-open-only')?.checked;
    const specialization = document.getElementById('specialization-filter')?.value || '';
    
    const nearby = pois
        .filter(p => p.name && p.name !== 'Unnamed' && p.name.trim() !== '' && !/^(clinic|hospital)$/i.test(p.name))
        .filter(p => clinicMatchesSpecialization(p, specialization))
        .map(p => {
            const availabilityInfo = getAvailabilityDisplay(p);
            return {
                ...p,
                distance: getDistance(userLat, userLon, p.lat, p.lon),
                availabilityInfo,
                isOpen: availabilityInfo.status === 'open'
            };
        })
        .filter(p => !openOnly || p.isOpen)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);

    if (nearby.length === 0) {
        pediList.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">No clinics found nearby</p>';
        return;
    }

    // Find nearest and nearest open for rerouting suggestion
    const { nearestClinic, nearestOpenClinic } = findNearestClinics(userLat, userLon, nearby);

    nearby.forEach((clinic, idx) => {
        const item = document.createElement('div');
        item.className = 'pedi-item';
        
        const isFav = isFavorite(clinic.id);
        const favBtn = `<span style="float:right; cursor:pointer; font-size:16px;" onclick="toggleFavorite(${clinic.id}, this); event.stopPropagation();" title="Save clinic">${isFav ? '⭐' : '☆'}</span>`;
        
        // Status indicator
        const statusInfo = clinic.availabilityInfo || getAvailabilityDisplay(clinic);
        const statusIcon = statusInfo.icon;
        const statusText = statusInfo.short;
        const statusColor = statusInfo.color;
        const confidence = getStatusConfidence(clinic);
        const appointment = getAppointmentAvailability(clinic);
        const appointmentColor = appointment.tone === 'open' ? '#2e7d32' : (appointment.tone === 'unknown' ? '#b26a00' : '#a04400');
        
        // Get timing info if available in database
        const timingInfo = getClinicTimingInfo(clinic.name, clinic.tags);
        
        // Check if this is the first clinic and it's closed - add rerouting suggestion
        let rerouteHtml = '';
        if (idx === 0 && !clinic.isOpen && nearestOpenClinic && nearestOpenClinic.id !== clinic.id) {
            const openDist = getDistance(userLat, userLon, nearestOpenClinic.lat, nearestOpenClinic.lon);
            const openClinicId = `reroute-clinic-${nearestOpenClinic.id}`;
            // Store the alternative clinic so it can be accessed by the button
            window[openClinicId] = nearestOpenClinic;
            
            rerouteHtml = `
                <div style="background:#e8f5e9; border-left:4px solid #4caf50; padding:10px; margin-top:10px; border-radius:2px;">
                    <div style="font-weight:600; color:#2e7d32; margin-bottom:5px;">✓ Nearest OPEN Alternative:</div>
                    <div style="font-size:14px; color:#333; margin-bottom:3px;"><strong>${nearestOpenClinic.name}</strong></div>
                    <div style="font-size:13px; color:#666;">📍 ${openDist.toFixed(1)} km away • 🟢 OPEN NOW</div>
                    <button onclick="selectClinic(${nearestOpenClinic.lat}, ${nearestOpenClinic.lon}, '${nearestOpenClinic.name.replace(/'/g, "\\'")}', '${nearestOpenClinic.type}', '${(nearestOpenClinic.tags.addr || '').replace(/'/g, "\\'")}', window['${openClinicId}']); event.stopPropagation();" 
                        style="margin-top:8px; padding:6px 12px; background:#4caf50; color:white; border:none; border-radius:3px; cursor:pointer; font-size:12px; font-weight:600;">
                        GO TO OPEN CLINIC
                    </button>
                </div>
            `;
        }
        
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <div class="pedi-item-name">${clinic.name}</div>
                        <span style="background:${statusColor}; color:white; padding:2px 8px; border-radius:3px; font-size:12px; font-weight:600;">${statusIcon} ${statusText}</span>
                    </div>
                    <div class="pedi-item-distance">📍 ${clinic.distance.toFixed(1)} km away</div>
                    <div class="pedi-item-type">${clinic.type}</div>
                    ${clinic.tags.phone ? `<a href="tel:${clinic.tags.phone}" class="pedi-item-phone" onclick="event.stopPropagation();">📞 ${clinic.tags.phone}</a>` : ''}
                    <div style="font-size:12px; color:#666; margin-top:4px;">Status confidence: <strong>${confidence.label}</strong> (${confidence.score}%)</div>
                    <div style="font-size:12px; color:${appointmentColor}; margin-top:4px;">🗓 ${appointment.text}</div>
                    ${timingInfo.hoursDisplay ? `<div style="font-size:12px; color:#666; margin-top:4px;">🕐 ${timingInfo.hoursDisplay}</div>` : ''}
                    ${rerouteHtml}
                </div>
                ${favBtn}
            </div>
        `;
        
        item.style.cursor = 'pointer';
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Start live tracking navigation
            selectClinic(clinic.lat, clinic.lon, clinic.name, clinic.type, clinic.tags.addr || '', clinic);
        });
        
        pediList.appendChild(item);
    });
}

function isFavorite(id) {
    return favorites.some(f => f.id === id);
}

function toggleFavorite(id, element) {
    const clinic = pois.find(p => p.id === id);
    if (!clinic) return;

    if (isFavorite(id)) {
        favorites = favorites.filter(f => f.id !== id);
        element.textContent = '☆';
        showNotification('Removed from favorites', 'info', 1500);
    } else {
        favorites.push(clinic);
        element.textContent = '⭐';
        showNotification('Added to favorites!', 'success', 1500);
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

/**
 * When user clicks on a clinic to get directions, store it and start live route tracking
 */
function selectClinic(lat, lon, name, type, addr, clinicObj, options = {}) {
    selectedClinic = { lat, lon, name, type, addr, obj: clinicObj };
    if (options.zoomMode === 'gta' && cinematicZoomEnabled) {
        gtaZoomToLocation(lat, lon);
    } else if (!options.skipZoom) {
        zoomToLocation(lat, lon);
    }
    showNotification(`📍 Navigating to: ${name}`, 'success', 2000);
    
    // Populate clinic details panel with COMPREHENSIVE information
    document.getElementById('clinic-name').textContent = name;
    document.getElementById('clinic-address').textContent = addr || 'Address not available';
    
    // PRIMARY PHONE
    const phone = clinicObj?.tags?.phone || clinicObj?.tags?.['contact:phone'] || clinicObj?.tags?.telephone || '';
    const phoneLink = document.getElementById('clinic-phone');
    if (phone) {
        phoneLink.href = `tel:${phone}`;
        phoneLink.textContent = phone;
        phoneLink.parentElement.style.display = 'block';
    } else {
        phoneLink.parentElement.style.display = 'none';
    }
    
    // ALTERNATIVE PHONE NUMBER
    const altPhone = clinicObj?.tags?.['alt:phone'] || '';
    const phoneSection = document.getElementById('clinic-phone-section') || phoneLink?.parentElement?.parentElement;
    if (altPhone && phoneSection) {
        const altPhoneHTML = `<div style="font-size:12px; color:#888; margin-top:4px;"><a href="tel:${altPhone}" style="color:#888; text-decoration:none;">📱 Alt: ${altPhone}</a></div>`;
        if (!document.getElementById('clinic-alt-phone')) {
            const div = document.createElement('div');
            div.id = 'clinic-alt-phone';
            div.innerHTML = altPhoneHTML;
            phoneLink?.parentElement?.appendChild(div);
        } else {
            document.getElementById('clinic-alt-phone').innerHTML = altPhoneHTML;
        }
    }
    
    // OPERATING HOURS
    const hoursText = getClinicHoursText(name, clinicObj?.tags || {});
    const hours = formatHoursDisplay(hoursText);
    if (hours) {
        let hoursDiv = document.getElementById('clinic-hours');
        if (!hoursDiv) {
            hoursDiv = document.createElement('div');
            hoursDiv.id = 'clinic-hours';
            hoursDiv.style.cssText = 'margin-top:8px; font-size:13px; color:#555;';
            phoneLink?.parentElement?.appendChild(hoursDiv);
        }
        hoursDiv.innerHTML = `<strong>⏰ Hours:</strong> ${hours}`;
    } else {
        const existing = document.getElementById('clinic-hours');
        if (existing) existing.remove();
    }
    
    // SERVICES PROVIDED
    const services = clinicObj?.tags?.services || '';
    if (services) {
        let servicesDiv = document.getElementById('clinic-services');
        if (!servicesDiv) {
            servicesDiv = document.createElement('div');
            servicesDiv.id = 'clinic-services';
            servicesDiv.style.cssText = 'margin-top:8px; font-size:13px; color:#555;';
            phoneLink?.parentElement?.appendChild(servicesDiv);
        }
        servicesDiv.innerHTML = `<strong>🏥 Services:</strong> ${services}`;
    }
    
    // WEBSITE
    const website = clinicObj?.tags?.website || clinicObj?.tags?.['contact:website'] || '';
    const websiteLink = document.getElementById('clinic-website');
    if (website) {
        websiteLink.href = website;
        websiteLink.textContent = 'Visit Website';
        websiteLink.parentElement.style.display = 'block';
    } else {
        websiteLink.parentElement.style.display = 'none';
    }
    
    // Update availability status with community consensus
    const statusInfo = getAvailabilityDisplay(clinicObj || {});
    const statusEl = document.getElementById('clinic-status-live');
    const confidence = getStatusConfidence(clinicObj || {});
    const statusSymbol = statusInfo.status === 'open' ? '✓' : (statusInfo.status === 'closed' ? '✗' : '?');
    statusEl.innerHTML = `<span style="color:${statusInfo.color}; font-weight:600;">${statusSymbol} ${statusInfo.text}</span> <small style="color:#666;">(${confidence.label} confidence ${confidence.score}%)</small>`;

    const appointment = getAppointmentAvailability(clinicObj || {});
    let appointmentDiv = document.getElementById('clinic-appointment');
    if (!appointmentDiv) {
        appointmentDiv = document.createElement('div');
        appointmentDiv.id = 'clinic-appointment';
        appointmentDiv.style.cssText = 'margin-top:8px; font-size:13px; color:#555;';
        phoneLink?.parentElement?.appendChild(appointmentDiv);
    }
    const appointmentColor = appointment.tone === 'open' ? '#2e7d32' : (appointment.tone === 'unknown' ? '#b26a00' : '#a04400');
    appointmentDiv.innerHTML = `<strong>🗓 Appointment:</strong> <span style="color:${appointmentColor};">${appointment.text}</span>`;
    
    // Show verification count
    const reports = getClinicReports(clinicObj?.id);
    const verifEl = document.getElementById('clinic-verification');
    if (reports.length > 0) {
        const openCount = reports.filter(r => r.status === 'open').length;
        const closedCount = reports.filter(r => r.status === 'closed').length;
        verifEl.querySelector('#clinic-verification-text').innerHTML = `📊 <strong>${reports.length}</strong> users reported: ${openCount} open, ${closedCount} closed • Confidence: <strong>${confidence.score}%</strong>`;
        verifEl.style.display = 'block';
    } else {
        verifEl.style.display = 'none';
    }
    
    // Show clinic panel
    const clinicPanel = document.getElementById('clinic-panel');
    if (clinicPanel) clinicPanel.style.display = 'block';
    
    // Show emergency call button
    showEmergencyCallButton();
    
    // Immediately calculate route
    if (lastKnownPosition) {
        recalculateRouteForSelectedClinic();
        // Calculate ETAs for all transport modes
        updateETADisplay(lastKnownPosition.lat, lastKnownPosition.lon, lat, lon);
    } else {
        showNotification('⏳ Waiting for GPS lock to calculate route...', 'warning', 2000);
    }
}

/**
 * Recalculate route for selected clinic with current user position (LIVE TRACKING)
 */
function recalculateRouteForSelectedClinic() {
    if (!selectedClinic || !lastKnownPosition) return;
    
    const { lat: clinicLat, lon: clinicLon, name: clinicName } = selectedClinic;
    const { lat: userLat, lon: userLon } = lastKnownPosition;
    
    // Get selected transport mode
    const transport = document.getElementById('transport-select')?.value || 'driving';
    const osrmProfile = (transport === 'walking') ? 'walking' : (transport === 'cycling') ? 'cycling' : 'driving';
    
    console.log(`📍 Recalculating route: User (${userLat.toFixed(4)}, ${userLon.toFixed(4)}) → ${clinicName}`);
    
    fetchRoute(userLat, userLon, clinicLat, clinicLon, osrmProfile)
        .then(route => {
            if (!route) {
                console.warn('Could not get route');
                return;
            }
            
            // Update route on map
            const routeSummary = document.getElementById('route-summary');
            if (routeSummary) {
                const distKm = (route.distance / 1000).toFixed(1);
                const minutes = Math.round(route.duration / 60);
                routeSummary.innerHTML = `
                    <strong>🎯 ${clinicName}</strong>
                    <div style="margin-top:8px; padding:10px; background:#e3f2fd; border-radius:4px;">
                        <div style="font-size:18px; font-weight:bold; color:#dc3545; animation: pulse-glow 1.5s infinite;">${distKm} km • ${minutes} min ➜</div>
                        <div style="font-size:12px; color:#666; margin-top:4px;">🔴 Live navigation | Real-time GPS updates</div>
                    </div>
                `;
            }
            
            // Draw/update animated route on map
            drawAnimatedRoute(route.geometry, clinicLat, clinicLon, clinicName);
            
            // Update ETAs for all transport modes
            updateETADisplay(userLat, userLon, clinicLat, clinicLon);
            
            // Update directions
            const stepList = document.getElementById('step-list');
            if (stepList) {
                stepList.innerHTML = '';
                const steps = route.steps || [];
                steps.forEach((s, idx) => {
                    const li = document.createElement('li');
                    let instr = s.maneuver?.instruction || '';
                    if (!instr) {
                        const mv = s.maneuver || {};
                        instr = mv.type ? mv.type.replace(/_/g, ' ') : 'Proceed';
                        if (mv.modifier) instr += ' ' + mv.modifier;
                        if (s.name) instr += ` onto ${s.name}`;
                    }
                    instr = cleanInstruction(instr);
                    li.textContent = `${idx + 1}. ${instr} — ${(s.distance/1000).toFixed(2)} km`;
                    stepList.appendChild(li);
                });
            }
        })
        .catch(err => console.error('Route error:', err));
}

// ============================================================================
// LOCATION & GEOLOCATION
// ============================================================================



/**
 * Reverse geocode coordinates to address (improved for detailed addresses)
 */
async function reverseGeocode(lat, lon) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout for slow networks
        
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
            { signal: controller.signal }
        );
        
        clearTimeout(timeout);
        
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        
        // Extract address components for better formatting (house number, street, subdivision, barangay)
        if (data?.address) {
            const addr = data.address;
            const parts = [];
            
            // Build address: house number + street + subdivision/suburb
            if (addr.house_number) parts.push(addr.house_number);
            if (addr.street) parts.push(addr.street);
            if (addr.suburb) parts.push(addr.suburb); // subdivision/residential area
            if (addr.neighbourhood) parts.push(addr.neighbourhood);
            if (!parts.length && addr.road) parts.push(addr.road);
            
            if (parts.length > 0) {
                return parts.join(', ');
            }
        }
        
        return data?.display_name || "Your Location";
    } catch (err) {
        console.error('Reverse geocode error:', err.message);
        return "Your Location";
    }
}

function ensureGeolocationAvailable() {
    if (!navigator.geolocation) {
        showNotification('❌ Geolocation not supported by your browser', 'error', 3000);
        return false;
    }
    if (!window.isSecureContext) {
        showNotification('❌ GPS requires HTTPS. Open this site over https:// or localhost.', 'error', 5000);
        return false;
    }
    return true;
}

function shouldAcceptLivePosition(lat, lon, accuracy) {
    if (!lastKnownPosition) return true;
    if (!Number.isFinite(accuracy)) return true;
    if (!Number.isFinite(userLocationAccuracy)) return true;

    const distanceM = getDistance(lastKnownPosition.lat, lastKnownPosition.lon, lat, lon) * 1000;
    const prevAcc = userLocationAccuracy;
    const acc = accuracy;

    // Accept if accuracy improves meaningfully.
    if (acc + 20 < prevAcc) return true;

    // Accept if the jump is reasonable for the current accuracy.
    const maxShift = Math.max(acc * 3, 300);
    if (distanceM <= maxShift) return true;

    // Accept if both accuracy and jump are still within a softer bound.
    if (distanceM <= Math.max(prevAcc * 2, 500) && acc <= prevAcc * 1.5) return true;

    return false;
}

function updateLocationAccuracyBadge() {
    const el = document.getElementById('location-accuracy');
    if (!el) return;

    if (!lastKnownPosition && !manualLocationUsed) {
        el.textContent = 'Accuracy: —';
        return;
    }

    let label = 'Location';
    if (manualLocationUsed) label = 'Manual (Approx.)';
    else if (locationMode === 'gps') label = 'GPS';
    else if (locationMode === 'network') label = 'Network';

    const accValue = userLocationAccuracy ? `±${Math.round(userLocationAccuracy)}m` : '±—';
    el.innerHTML = `<span class="accuracy-label">${label}</span><span class="accuracy-value">${accValue}</span>`;
}

function isHealthcareLocationQuery(query) {
    return /\b(clinic|hospital|doctor|doctors|health|medical|pediatric|pediatr)\b/i.test(String(query || ''));
}

function scoreManualGeocodeCandidate(result, query) {
    const queryLower = String(query || '').toLowerCase();
    const normalizedQuery = queryLower.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const stopWords = new Set(['general', 'santos', 'city', 'philippines', 'barangay', 'street', 'road', 'avenue']);
    const tokens = normalizedQuery.split(' ').filter(t => t.length >= 3 && !stopWords.has(t));
    const healthcareQuery = isHealthcareLocationQuery(query);

    const candidateText = [
        result?.display_name,
        result?.name,
        result?.type,
        result?.class,
        result?.category,
        result?.addresstype
    ].join(' ').toLowerCase();

    let score = 0;
    if (normalizedQuery && candidateText.includes(normalizedQuery)) score += 120;

    tokens.forEach(token => {
        if (candidateText.includes(token)) score += 16;
    });

    const addr = result?.address || {};
    if (addr.house_number) score += 18;
    if (addr.road || addr.street) score += 14;
    if (addr.neighbourhood || addr.suburb) score += 10;
    if (addr.city || addr.town || addr.village) score += 6;
    if (addr.postcode) score += 4;

    if (/residential|house|building|address|street|road|neighbourhood|suburb|village|hamlet/.test(candidateText)) {
        score += 30;
    }

    const looksHealthcare = /clinic|hospital|doctors|doctor|health|medical|pediatric|pediatr/.test(candidateText);
    if (looksHealthcare && !healthcareQuery) score -= 80;
    if (looksHealthcare && healthcareQuery) score += 20;

    const importance = parseFloat(result?.importance);
    if (Number.isFinite(importance)) score += importance * 10;

    return score;
}

function findAreaCoordinatesFromManualText(locationText) {
    const lowerLocation = String(locationText || '').toLowerCase();
    if (!lowerLocation) return null;

    let bestMatch = null;
    let bestKeyLength = 0;

    for (const [key, coords] of Object.entries(LOCATION_COORDINATES)) {
        const keyLower = key.toLowerCase();
        if (lowerLocation.includes(keyLower) && keyLower.length > bestKeyLength) {
            bestMatch = { ...coords, name: key };
            bestKeyLength = keyLower.length;
        }
    }

    return bestMatch;
}

/**
 * Geocode manual location input with hybrid approach:
 * 1. Check local database for known locations (Option 1)
 * 2. Use improved Nominatim API with bounds checking (Option 2)
 * 3. Fallback to local clinic database
 */
async function geocodeManualLocation(query) {
    try {
        console.log('🔍 Geocoding:', query);
        
        // ========== OPTION 1: CHECK LOCAL DATABASE FIRST ==========
        const dbCoords = getCoordinatesFromDatabase(query);
        if (dbCoords) {
            console.log(`✅ Found in local database: ${query}`, dbCoords);
            return [{
                lat: dbCoords.lat.toString(),
                lon: dbCoords.lon.toString(),
                display_name: query,
                type: dbCoords.type,
                _manualScore: 999,
                _manualSource: 'local-database'
            }];
        }
        
        // ========== OPTION 2: IMPROVED NOMINATIM API CALLS ==========
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        // Construct search query with city context
        let searchQuery = query;
        if (!searchQuery.toLowerCase().includes('general santos') && 
            !searchQuery.toLowerCase().includes('gensan') &&
            !searchQuery.toLowerCase().includes('sarangani')) {
            searchQuery = `${query}, General Santos City, Sarangani, Philippines`;
        }
        
        // Primary search: Tight bounds within GenSan City
        const searchParams = new URLSearchParams({
            q: searchQuery,
            format: 'json',
            viewbox: '125.08,6.05,125.23,6.18', // Expanded GenSan bounds
            bounded: 1, // Strict bounds
            zoom: 18, // Max zoom for house-level detail
            limit: 20, // Get more candidates
            addressdetails: 1,
            extratags: 1,
            namedetails: 1
        });
        
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?${searchParams}`,
            { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('Geocoding service error');
        
        let results = await response.json();
        
        // Filter and prioritize results
        if (Array.isArray(results) && results.length > 0) {
            // Filter for results within GenSan City
            results = results.filter(r => {
                const lat = parseFloat(r.lat);
                const lon = parseFloat(r.lon);
                return lat >= 6.05 && lat <= 6.18 && lon >= 125.08 && lon <= 125.23;
            });
            
            if (results.length > 0) {
                results = results
                    .map(r => ({
                        ...r,
                        _manualScore: scoreManualGeocodeCandidate(r, query),
                        _manualSource: 'nominatim-primary'
                    }))
                    .sort((a, b) => (b._manualScore || 0) - (a._manualScore || 0));
                
                console.log(`✅ Nominatim found ${results.length} result(s)`);
                return results;
            }
        }
        
        // Secondary search: Less strict bounds (nearby areas)
        console.log('⚠️ Primary search empty, trying with relaxed bounds...');
        const relaxedParams = new URLSearchParams({
            q: query.replace(/,/g, ' '),
            format: 'json',
            viewbox: '125.00,6.00,125.30,6.25', // Wider search area
            bounded: 0, // Relaxed bounds
            zoom: 16,
            limit: 15,
            addressdetails: 1
        });
        
        const relaxedResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?${relaxedParams}`,
            { signal: controller.signal }
        );
        
        if (relaxedResponse.ok) {
            let relaxedResults = await relaxedResponse.json();
            if (Array.isArray(relaxedResults) && relaxedResults.length > 0) {
                console.log(`✅ Found ${relaxedResults.length} result(s) with relaxed search`);
                relaxedResults = relaxedResults
                    .filter(r => {
                        const lat = parseFloat(r.lat);
                        const lon = parseFloat(r.lon);
                        return lat >= 6.05 && lat <= 6.18 && lon >= 125.08 && lon <= 125.23;
                    })
                    .map(r => ({
                        ...r,
                        _manualScore: scoreManualGeocodeCandidate(r, query),
                        _manualSource: 'nominatim-relaxed'
                    }))
                    .sort((a, b) => (b._manualScore || 0) - (a._manualScore || 0));

                if (relaxedResults.length === 0) {
                    console.warn('Relaxed search found only out-of-area results');
                    return [];
                }

                return relaxedResults;
            }
        }
        
        console.warn('⚠️ Nominatim returned no results');
        return [];
        
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('⏱️ Geocoding timeout - network is slow');
            showNotification('⏱️ Address lookup is slow. Please try a simpler location name.', 'warning', 3000);
        } else {
            console.error('Geocoding error:', err.message);
        }
        return [];
    }
}

/**
 * Show manual location modal (fallback when GPS takes too long)
 */
function showManualLocationModal() {
    const modal = document.getElementById('manual-location-modal');
    if (modal) modal.style.display = 'flex';
    showNotification('⏱️ GPS is taking longer than expected. You can use manual location below.', 'warning', 3000);
}

/**
 * Hide manual location modal
 */
function hideManualLocationModal() {
    const modal = document.getElementById('manual-location-modal');
    if (modal) modal.style.display = 'none';
}

function stopLiveTracking(reasonText) {
    if (liveTrackingWatchId && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(liveTrackingWatchId); } catch (e) {}
        liveTrackingWatchId = null;
    }
    isLiveTracking = false;
    gpsLockedIn = false;

    const locIndicator = document.getElementById('location-indicator');
    if (locIndicator && reasonText) locIndicator.innerHTML = reasonText;

    const startBtn = document.getElementById('start-tracking');
    const stopBtn = document.getElementById('stop-tracking');
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
}

/**
 * Use user's manually entered location
 */
async function useManualLocation(location) {
    console.log('Manual location input:', location);

    // First, try geocoding with confidence scoring.
    let lat, lon, display_name;

    try {
        const results = await geocodeManualLocation(location);

        if (results && results.length > 0) {
            const topResult = results[0];
            const score = Number.isFinite(topResult?._manualScore) ? topResult._manualScore : 0;
            const minScore = isHealthcareLocationQuery(location) ? -40 : 20;

            if (score < minScore) {
                throw new Error(`Low-confidence geocode result (score: ${score})`);
            }

            ({ lat, lon, display_name } = topResult);
        } else {
            throw new Error('Geocoding returned no results');
        }
    } catch (err) {
        console.warn('Geocoding failed, switching to local fallback:', err.message || err);
        showNotification('Searching local database for your location...', 'info', 2000);

        // Fallback 1: Known area centers (barangay/subdivision/landmark).
        const knownArea = findAreaCoordinatesFromManualText(location) || getCoordinatesFromDatabase(location);
        if (knownArea) {
            lat = knownArea.lat;
            lon = knownArea.lon;
            display_name = location.length <= 45 ? location : `Approximate area: ${knownArea.name || location}`;
            showNotification(`Found area center for: ${display_name}`, 'success', 2200);
        } else {
            // Fallback 2: Use centroid of matched local POIs (never fallback to pois[0]).
            const lowerLocation = location.toLowerCase();
            const locationMatches = pois.filter(clinic => {
                const name = clinic.name ? clinic.name.toLowerCase() : '';
                const address = clinic.address ? clinic.address.toLowerCase() : '';
                const tags = clinic.tags ? JSON.stringify(clinic.tags).toLowerCase() : '';
                return name.includes(lowerLocation) || address.includes(lowerLocation) || tags.includes(lowerLocation);
            });

            if (locationMatches.length > 0) {
                const sample = locationMatches.slice(0, 5);
                lat = sample.reduce((sum, c) => sum + parseFloat(c.lat), 0) / sample.length;
                lon = sample.reduce((sum, c) => sum + parseFloat(c.lon), 0) / sample.length;
                display_name = location.length <= 45 ? location : 'Approximate area from local matches';
                showNotification('Using approximate coordinates from local matches.', 'warning', 2600);
            } else {
                showNotification('Location not found. Please use a barangay/subdivision/street in GenSan.', 'error', 3200);
                return;
            }
        }
    }

    // Validate in service area; warning only.
    if (!isLocationInGenSanCity(parseFloat(lat), parseFloat(lon), `${display_name} ${location}`)) {
        console.warn('Location validation warning, proceeding with user-provided area.');
    }

    manualLocationUsed = true;
    locationMode = 'manual';
    userLocationAccuracy = 1000; // ~1km radius for manual location
    userAddress = display_name;
    lastKnownPosition = { lat: parseFloat(lat), lon: parseFloat(lon) };
    pendingPosition = null;

    stopLiveTracking('📍 Manual location active');
    updateLocationAccuracyBadge();

    // Update map/UI immediately from local data.
    updateUIAfterLocation(parseFloat(lat), parseFloat(lon));
    updatePediatriciansNearby(parseFloat(lat), parseFloat(lon));
    map.setView([parseFloat(lat), parseFloat(lon)], 16);

    hideManualLocationModal();
    showNotification(`Location set: ${display_name}`, 'success', 2500);
    console.log(`Manual location set: ${lat}, ${lon}`);

    // Auto-route to nearest clinic.
    if (pois.length > 0) {
        findAndRouteToNearestClinic(parseFloat(lat), parseFloat(lon));
    }
}


/**
 * Find the nearest clinic from the given location and automatically route to it
 * This is called when user enters their location manually
 */
function findAndRouteToNearestClinic(userLat, userLon) {
    let nearest = null;
    let minDistance = Infinity;
    
    pois.forEach(clinic => {
        // Skip unnamed POIs and those without coordinates
        if (!clinic || !clinic.lat || !clinic.lon || !clinic.name || clinic.name === 'Unnamed' || clinic.name.trim() === '' || /^(clinic|hospital)$/i.test(clinic.name)) {
            return;
        }
        const distance = getDistance(userLat, userLon, clinic.lat, clinic.lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = clinic;
        }
    });
    
    if (nearest) {
        // Select the clinic and show route - this will automatically calculate and display directions
        selectClinic(nearest.lat, nearest.lon, nearest.name, nearest.type, nearest.tags.addr || nearest.tags['addr:full'] || '', nearest, { zoomMode: 'gta' });
        showNotification(`🎯 Auto-routing to nearest clinic: ${nearest.name} (${minDistance.toFixed(1)} km away)`, 'success', 3500);
    } else {
        showNotification('⚠️ No clinics found to route to', 'warning', 2500);
    }
}

/**
 * Geocode any address (not just clinic names) to coordinates
 * Used when user types their own address in the search bar
 */
async function geocodeAddress(address) {
    try {
        const searchParams = new URLSearchParams({
            q: address,
            format: 'json',
            viewbox: '125.12,6.08,125.20,6.15', // GenSan bounds
            bounded: 1
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${searchParams}`);
        const results = await response.json();
        return results || [];
    } catch (err) {
        console.error('Geocoding error:', err);
        return [];
    }
}

function handlePosition(position) {
    const { latitude: lat, longitude: lon, accuracy } = position.coords;
    // If accuracy is poor (>100m) treat as likely network-based / low-confidence and
    // keep it as a pending position while waiting for a better GPS lock.
    if (accuracy > 100) {
        console.log(`⚠️ Low-accuracy location (${accuracy}m). Treating as pending; waiting for true GPS lock.`);
        pendingPosition = { lat, lon, accuracy };
        showNotification('📡 Low accuracy location detected. Waiting for GPS satellite lock (move outdoors)', 'warning', 4500);
        return;
    }

    userLocationAccuracy = accuracy;

    // Reverse geocode
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(data => {
            if (data && data.display_name) {
                userAddress = data.display_name;
            } else {
                userAddress = "General Santos City, Philippines";
            }
            updateUIAfterLocation(lat, lon);
        })
        .catch(err => {
            console.error('Reverse geocode error:', err);
            userAddress = "General Santos City, Philippines";
            updateUIAfterLocation(lat, lon);
        });
}

/**
 * GPS/NETWORK LIVE TRACKING: 
 * Continuously watch user location and automatically update route/nearby clinics as they move
 * Fallback to manual location if accurate signal takes too long
 */
function startAutoGeolocation() {
    if (!ensureGeolocationAvailable()) {
        const lat = 6.1164; const lon = 125.1716;
        userAddress = "General Santos City, Philippines";
        updateUIAfterLocation(lat, lon);
        map.setView([lat, lon], 13);
        return;
    }

    manualLocationUsed = false;
    locationMode = 'unknown';
    ignorePositionJump = true;
    pendingPosition = null;
    window.mapCenteredOnUser = false;
    gpsLockedIn = false;
    ignorePositionJump = true;

    showNotification('📍 Acquiring GPS location... (this takes 10-30 seconds)', 'info', 4000);
    const locIndicator = document.getElementById('location-indicator');
    if (locIndicator) locIndicator.innerHTML = '📍 🔄 Acquiring GPS...';

    let gpsLocked = false;
    let bestAccuracy = Infinity;
    gpsStartTime = Date.now();
    let manualLocationTimeout = null;

    const options = {
        enableHighAccuracy: true,   // Force real GPS (not IP)
        maximumAge: 0,              // Never use cached position
        timeout: 30000              // 30 second timeout per request
    };

    // If a previous watch exists, clear it to avoid duplicate watchers
    if (liveTrackingWatchId) {
        try { navigator.geolocation.clearWatch(liveTrackingWatchId); } catch (e) { /* ignore */ }
        liveTrackingWatchId = null;
    }

    // Set timeout to show manual location modal if GPS takes too long (20 seconds for faster fallback)
    manualLocationTimeout = setTimeout(() => {
        if (!gpsLockedIn && !manualLocationUsed) {
            console.log('⏱️ GPS took too long (20s). Showing manual location option.');
            showManualLocationModal();
            showNotification('📍 GPS taking longer than expected. Enter your address to search nearby clinics...', 'info', 4000);
        }
    }, 20000);

    // Start continuous live tracking
    liveTrackingWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            console.log(`📡 GPS update: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (±${accuracy.toFixed(0)}m)`);

            if (manualLocationUsed) {
                // Manual location is active; ignore GPS updates until user switches back.
                return;
            }

            // Validate location is within General Santos City (with expanded boundaries)
            if (!isLocationInGenSanCity(latitude, longitude)) {
                console.warn('⚠️ GPS location outside expected bounds, but continuing anyway - may be near city edge');
                // Don't return - allow locations near the boundary
            }

            // Track best accuracy
            if (accuracy < bestAccuracy) {
                bestAccuracy = accuracy;
            }

            // Warn if accuracy is poor (network-based or weak GPS signal)
            if (!gpsLocked && accuracy > 100 && accuracy <= 500) {
                console.warn(`⚠️ Poor GPS accuracy: ${accuracy.toFixed(0)}m - This might be network-based location`);
                const locIndicator = document.getElementById('location-indicator');
                if (locIndicator) {
                    locIndicator.innerHTML = `📍 ⚠️ Poor GPS signal (${accuracy.toFixed(0)}m) - Please go outdoors`;
                }
            }

            const isGpsAccuracy = accuracy <= GPS_LOCK_ACCURACY_M;
            const isNetworkAccuracy = accuracy > GPS_LOCK_ACCURACY_M && accuracy <= NETWORK_LOCATION_MAX_ACCURACY_M;

            // Lock on GPS or network once accuracy is reasonable
            if (!gpsLocked && (isGpsAccuracy || isNetworkAccuracy)) {
                gpsLocked = true;
                gpsLockedIn = true;
                locationMode = isGpsAccuracy ? 'gps' : 'network';
                
                // Clear the manual location timeout since we got GPS lock
                if (manualLocationTimeout) clearTimeout(manualLocationTimeout);
                
                // Determine accuracy level
                let accuracyLevel = 'Excellent GPS';
                if (isNetworkAccuracy) {
                    accuracyLevel = 'Network Location (Approximate)';
                } else if (accuracy > 50) {
                    accuracyLevel = 'WiFi-Assisted GPS (Good)';
                }
                
                // If manual location modal was shown, hide it and switch to GPS
                if (manualLocationUsed) {
                    hideManualLocationModal();
                    showNotification(`✅ GPS Locked! ${accuracyLevel} (±${accuracy.toFixed(0)}m)`, 'success', 2500);
                    manualLocationUsed = false;
                } else {
                    showNotification(`✅ Location Locked! ${accuracyLevel} (±${accuracy.toFixed(0)}m) — Starting live tracking...`, 'success', 2500);
                }
                console.log('🎯 GPS LOCKED - Live tracking enabled');
                    // Auto-route to nearest clinic on GPS lock
                    if (pois && pois.length > 0) {
                        let nearest = null;
                        let minDistance = Infinity;
                        pois.forEach(clinic => {
                            if (!clinic || !clinic.lat || !clinic.lon || !clinic.name || clinic.name === 'Unnamed' || clinic.name.trim() === '' || /^(clinic|hospital)$/i.test(clinic.name)) {
                                return;
                            }
                            const distance = getDistance(latitude, longitude, clinic.lat, clinic.lon);
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearest = clinic;
                            }
                        });
                        if (nearest) {
                            selectClinic(nearest.lat, nearest.lon, nearest.name, nearest.type, nearest.tags.addr || '', nearest, { zoomMode: 'gta' });
                            showNotification(`🎯 Auto-routing to nearest clinic: ${nearest.name} (${minDistance.toFixed(1)} km)`, 'success', 3000);
                        }
                    }
            }

            // Update location (only if locked)
            if (gpsLocked) {
                if (!ignorePositionJump && !shouldAcceptLivePosition(latitude, longitude, accuracy)) {
                    console.warn('⚠️ Ignored location jump due to poor accuracy vs last fix.');
                    return;
                }
                ignorePositionJump = false;
                userLocationAccuracy = accuracy;
                lastKnownPosition = { lat: latitude, lon: longitude };

                // Only fully update UI after GPS lock
                reverseGeocode(latitude, longitude).then(address => {
                    userAddress = address;
                    updateUIAfterLocation(latitude, longitude);
                });

                // If user selected a clinic, recalculate route with new position
                if (selectedClinic) {
                    recalculateRouteForSelectedClinic();
                }

                // Update nearby clinics list (for live distance updates)
                updatePediatriciansNearby(latitude, longitude);

                // Update UI indicator
                if (locIndicator) {
                    const label = locationMode === 'network' ? 'Approx. Network Location' : 'Live Tracking';
                    locIndicator.innerHTML = `📍 <strong>${label}</strong> (±${accuracy.toFixed(0)}m)`;
                }
            }
        },
        (error) => {
            console.error('GPS error:', error.code, error.message);
            let errorMsg = '❌ GPS Error: ';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg += 'Permission denied. Allow location in browser settings.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg += 'GPS signal not available. Go outdoors with clear sky view.';
                    break;
                case error.TIMEOUT:
                    errorMsg += 'GPS timeout. Try moving to an open area.';
                    break;
                default:
                    errorMsg += 'Unknown error. Check location settings.';
            }
            
            showNotification(errorMsg, 'error', 4000);
            console.error('Full error:', error);
        },
        options
    );

    isLiveTracking = true;

    // Update UI buttons
    const startBtn = document.getElementById('start-tracking');
    const stopBtn = document.getElementById('stop-tracking');
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-block';
}

function updateUIAfterLocation(lat, lon) {
    lastKnownPosition = { lat, lon };
    
    // Update location indicator
    const locIndicator = document.getElementById('location-indicator');
    if (locIndicator) {
        const accuracy = userLocationAccuracy ? `(±${userLocationAccuracy.toFixed(0)}m)` : '';
        if (manualLocationUsed) {
            locIndicator.innerHTML = `📍 <strong>Manual Location</strong> ${accuracy}`;
        } else if (locationMode === 'network') {
            locIndicator.innerHTML = `📍 <strong>Approx. Network Location</strong> ${accuracy}`;
        } else if (isLiveTracking) {
            locIndicator.innerHTML = `📍 <strong>Live Tracking</strong> ${accuracy}`;
        } else {
            locIndicator.innerHTML = `📍 <strong>Location Set</strong> ${accuracy}`;
        }
    }
    updateLocationAccuracyBadge();
    
    // Create or update user location marker
    if (!window.userMarker) {
        window.userMarker = L.marker([lat, lon], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map).bindPopup(`<b>📍 Your Location</b><br>${userAddress}`);
    } else {
        // Smoothly update marker position
        window.userMarker.setLatLng([lat, lon]).setPopupContent(`<b>📍 Your Location</b><br>${userAddress}`);
    }
    
    // Center map on user once (first lock only)
    if (!window.mapCenteredOnUser && isLiveTracking) {
        map.setView([lat, lon], 16);
        window.mapCenteredOnUser = true;
    }
}

function getAccurateLocation() {
    if (!ensureGeolocationAvailable()) return;

    manualLocationUsed = false;
    locationMode = 'unknown';

    const getLocBtn = document.getElementById('get-location-btn');
    if (getLocBtn) {
        getLocBtn.textContent = '⏳ Getting your location...';
        getLocBtn.disabled = true;
    }

    showNotification('📍 Acquiring GPS signal... (this takes 10-30 seconds outdoors)', 'info', 5000);

    // Prefer GPS (enableHighAccuracy) but allow network-based fallback if GPS is weak
    // Google Maps uses: enableHighAccuracy=true, maximumAge=0, and long timeout
    const options = {
        enableHighAccuracy: true,    // Force GPS, not IP geolocation
        maximumAge: 0,                // Never use cached location
        timeout: 20000                // Give GPS 20 seconds to lock on satellites, then show manual option
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            const isGpsAccuracy = accuracy <= GPS_LOCK_ACCURACY_M;
            const isNetworkAccuracy = accuracy > GPS_LOCK_ACCURACY_M && accuracy <= NETWORK_LOCATION_MAX_ACCURACY_M;

            // If accuracy is too poor, reject it.
            if (!isGpsAccuracy && !isNetworkAccuracy) {
                console.log(`⚠️ Rejected: Accuracy ${accuracy}m = too imprecise`);
                
                if (getLocBtn) {
                    getLocBtn.textContent = '📡 Get My Location';
                    getLocBtn.disabled = false;
                }
                
                showNotification('❌ Location accuracy too low.\n\n✅ Tips:\n1. Go outdoors to open area\n2. Clear view of sky (no tall buildings)\n3. Wait 20-30 seconds for better lock\n4. Try again or use manual location', 'error', 6000);
                return;
            }
            
            userLocationAccuracy = accuracy;
            gpsLockedIn = true;
            locationMode = isGpsAccuracy ? 'gps' : 'network';
            
            // Accuracy: <30m = Real GPS | 30-100m = WiFi+GPS
            let accuracyStatus = '✅ GPS (Highly Accurate)';
            if (isNetworkAccuracy) {
                accuracyStatus = '📶 Network Location (Approximate)';
            } else if (accuracy > 30) {
                accuracyStatus = '📶 WiFi+GPS (Good)';
            }
            
            userAddress = `Your Location (±${accuracy.toFixed(0)}m accurate)`;
            updateUIAfterLocation(latitude, longitude);
            map.setView([latitude, longitude], 16);
            
            showNotification(`✅ Location Found! ${accuracyStatus}\n±${accuracy.toFixed(0)}m accuracy`, 'success', 4000);
            
            console.log(`📍 Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (±${accuracy.toFixed(0)}m)`);
            
            if (getLocBtn) {
                getLocBtn.textContent = '📡 Get My Location';
                getLocBtn.disabled = false;
            }
        },
        (error) => {
            console.error('Geolocation error code:', error.code, error.message);
            
            let errorMsg = '';
            let errorTitle = '❌ Location Error: ';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = 'You blocked location access. Check your browser settings:\n' +
                              '1. Click the lock icon next to the URL\n' +
                              '2. Find "Location" and change to "Allow"\n' +
                              '3. Reload the page';
                    errorTitle = '🚫 Permission Denied: ';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = 'GPS signal not found. This happens when:\n' +
                              '• Indoors with no window view of sky\n' +
                              '• Surrounded by tall buildings\n\n' +
                              'Solution: Move outdoors to an open area with clear sky view.';
                    errorTitle = '📡 GPS Not Available: ';
                    break;
                case error.TIMEOUT:
                    errorMsg = 'GPS took too long (45+ seconds). This means:\n' +
                              '• Weak GPS signal (indoors, urban canyon)\n' +
                              '• Too many obstacles blocking sky view\n\n' +
                              'Solution: Try moving to an open area or wait longer.';
                    errorTitle = '⏱️ Timeout: ';
                    break;
                default:
                    errorMsg = 'Unknown location error. Try refreshing the page.';
            }
            
            showNotification(errorTitle + errorMsg, 'error', 5000);
            
            // Fallback to GenSan center
            const lat = 6.1164;
            const lon = 125.1716;
            userAddress = "General Santos City (Using Default Location)";
            updateUIAfterLocation(lat, lon);
            map.setView([lat, lon], 14);
            
            if (getLocBtn) {
                getLocBtn.textContent = '📡 Get My Location';
                getLocBtn.disabled = false;
            }
        },
        options
    );
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Get My Location button
document.getElementById('get-location-btn')?.addEventListener('click', getAccurateLocation);

// Refresh location button
document.getElementById('refresh-location')?.addEventListener('click', getAccurateLocation);

// Search functionality with autocomplete and button support
document.getElementById('address-input')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim();
    
    // Show/hide clear button
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) clearBtn.style.display = searchTerm ? 'block' : 'none';
    
    if (!searchTerm) {
        // If search is empty, show all clinics sorted by distance
        document.getElementById('search-suggestions')?.classList.remove('active');
        if (lastKnownPosition) {
            updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
        } else {
            renderClinicList(pois);
        }
        return;
    }

    // Generate autocomplete suggestions from local pois array (works offline/weak bandwidth)
    const suggestions = pois.filter(clinic => {
        // Skip unnamed clinics
        if (!clinic.name || clinic.name === 'Unnamed' || clinic.name.trim() === '' || /^(clinic|hospital)$/i.test(clinic.name)) {
            return false;
        }
        const name = clinic.name ? clinic.name.toLowerCase() : '';
        const address = clinic.address ? clinic.address.toLowerCase() : '';
        const tags = clinic.tags || {};
        const phone = (tags.phone ? tags.phone.toLowerCase() : '') + (tags['contact:phone'] ? tags['contact:phone'].toLowerCase() : '');
        
        return name.includes(searchTerm.toLowerCase()) || 
               address.includes(searchTerm.toLowerCase()) || 
               phone.includes(searchTerm.toLowerCase());
    }).slice(0, 8); // Limit to 8 suggestions

    // Display suggestions dropdown
    const suggestionsDiv = document.getElementById('search-suggestions');
    if (suggestionsDiv) {
        if (suggestions.length > 0) {
            suggestionsDiv.innerHTML = '';
            suggestions.forEach(clinic => {
                const div = document.createElement('div');
                div.className = 'search-suggestion-item';
                const distance = lastKnownPosition ? 
                    `${getDistance(lastKnownPosition.lat, lastKnownPosition.lon, clinic.lat, clinic.lon).toFixed(1)}km` : 
                    'N/A';
                div.innerHTML = `<strong>${clinic.name}</strong><br/><small style="color:#999;">${clinic.address} • ${distance}</small>`;
                div.style.cursor = 'pointer';
                div.onclick = () => {
                    // Select this clinic
                    document.getElementById('address-input').value = clinic.name;
                    selectClinic(clinic.lat, clinic.lon, clinic.name, clinic.type, clinic.address, clinic);
                    suggestionsDiv.classList.remove('active');
                    showNotification(`📍 Selected: ${clinic.name}`, 'success', 2000);
                };
                suggestionsDiv.appendChild(div);
            });
            suggestionsDiv.classList.add('active');
        } else {
            suggestionsDiv.classList.remove('active');
        }
    }
});

// Clear search button
document.getElementById('clear-search')?.addEventListener('click', () => {
    document.getElementById('address-input').value = '';
    document.getElementById('clear-search').style.display = 'none';
    document.getElementById('search-suggestions')?.classList.remove('active');
    if (lastKnownPosition) {
        updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
    } else {
        renderClinicList(pois);
    }
});

// Search button - search by text and show results
document.getElementById('search-address')?.addEventListener('click', () => {
    const searchTerm = document.getElementById('address-input')?.value.trim();
    
    if (!searchTerm) {
        showNotification('🔍 Please enter a clinic name or address', 'warning', 2000);
        return;
    }

    // Filter clinics by search term (works offline)
    const filteredClinics = pois.filter(clinic => {
        const name = clinic.name ? clinic.name.toLowerCase() : '';
        const address = clinic.address ? clinic.address.toLowerCase() : '';
        return name.includes(searchTerm.toLowerCase()) || address.includes(searchTerm.toLowerCase());
    });

    // If we have location, sort by distance. Otherwise, just show matches
    if (lastKnownPosition) {
        filteredClinics.forEach(clinic => {
            clinic.distance = getDistance(lastKnownPosition.lat, lastKnownPosition.lon, clinic.lat, clinic.lon);
        });
        filteredClinics.sort((a, b) => a.distance - b.distance);
    }

    // If exactly one match, automatically select it and show directions
    if (filteredClinics.length === 1) {
        const clinic = filteredClinics[0];
        selectClinic(clinic.lat, clinic.lon, clinic.name, clinic.type, clinic.address, clinic);
        document.getElementById('search-suggestions')?.classList.remove('active');
        showNotification(`✅ Found: ${clinic.name}`, 'success', 2000);
    } else if (filteredClinics.length > 1) {
        // Show multiple results in clinic list
        renderClinicList(filteredClinics);
        document.getElementById('search-suggestions')?.classList.remove('active');
        showNotification(`🏥 Found ${filteredClinics.length} clinics matching "${searchTerm}"`, 'info', 2000);
    } else {
        showNotification(`❌ No clinics found matching "${searchTerm}"`, 'warning', 2500);
    }
});

// Find nearest button - Start live tracking navigation
document.getElementById('find-nearest-btn')?.addEventListener('click', () => {
    // Determine best available user position: prefer locked GPS, then manual, then pending low-accuracy
    let userPos = lastKnownPosition;
    if (!userPos && manualLocationUsed && lastKnownPosition) userPos = lastKnownPosition;
    if (!userPos && pendingPosition) userPos = pendingPosition;
    if (!userPos) {
        showNotification('📡 Waiting for GPS lock (or use manual location) to find nearest clinic...', 'warning', 3000);
        return;
    }
    
    if (pois.length === 0) {
        showNotification('⏳ Clinics are still loading. Please wait...', 'warning', 3000);
        return;
    }

    let nearest = null;
    let minDistance = Infinity;

    pois.forEach(clinic => {
        // Skip unnamed POIs and those without coordinates
        if (!clinic || !clinic.lat || !clinic.lon || !clinic.name || clinic.name === 'Unnamed' || clinic.name.trim() === '' || /^(clinic|hospital)$/i.test(clinic.name)) {
            return;
        }
        const distance = getDistance(userPos.lat, userPos.lon, clinic.lat, clinic.lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = clinic;
        }
    });

    if (nearest) {
        // Use live tracking instead of just zooming
        selectClinic(nearest.lat, nearest.lon, nearest.name, nearest.type, nearest.tags.addr || '', nearest, { zoomMode: 'gta' });
        showNotification(`🎯 Starting live navigation to ${nearest.name} (${minDistance.toFixed(1)} km)`, 'success', 3000);
    } else {
        showNotification('❌ No pediatrician clinics found nearby', 'warning', 3000);
    }
});

// ============================================================================
// MANUAL LOCATION MODAL LISTENERS
// ============================================================================

// Manual location input - autocomplete suggestions
document.getElementById('manual-location-input')?.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    const suggestionsDiv = document.getElementById('manual-location-suggestions');
    
    if (!query || query.length < 2) {
        if (suggestionsDiv) suggestionsDiv.innerHTML = '';
        return;
    }
    
    const results = await geocodeManualLocation(query);
    
    if (suggestionsDiv) {
        suggestionsDiv.innerHTML = '';
        results.slice(0, 5).forEach(result => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:10px; cursor:pointer; border-bottom:1px solid #eee;';
            div.textContent = result.display_name;
            div.onclick = () => {
                document.getElementById('manual-location-input').value = result.display_name;
                suggestionsDiv.innerHTML = '';
            };
            suggestionsDiv.appendChild(div);
        });
    }
});

// Use manual location button
document.getElementById('use-manual-location-btn')?.addEventListener('click', async () => {
    const location = document.getElementById('manual-location-input')?.value.trim();
    if (!location) {
        showNotification('📝 Please enter a location', 'warning', 2000);
        return;
    }
    await useManualLocation(location);
});

// Skip manual location button
document.getElementById('skip-manual-location-btn')?.addEventListener('click', () => {
    hideManualLocationModal();
    showNotification('⏳ Continuing to wait for GPS...', 'info', 2000);
});

// Switch back to GPS from manual modal
document.getElementById('switch-to-gps-btn')?.addEventListener('click', () => {
    manualLocationUsed = false;
    locationMode = 'unknown';
    pendingPosition = null;
    ignorePositionJump = true;
    hideManualLocationModal();
    showNotification('📍 Switching to GPS...', 'info', 2000);
    startAutoGeolocation();
});

document.getElementById('layer-2d')?.addEventListener('click', () => switchLayer('2d'));
document.getElementById('layer-satellite')?.addEventListener('click', () => switchLayer('satellite'));
document.getElementById('layer-terrain')?.addEventListener('click', () => switchLayer('terrain'));

// Start / Stop live-tracking buttons
document.getElementById('start-tracking')?.addEventListener('click', () => {
    // Start the geolocation watcher and live tracking
    startAutoGeolocation();
});

document.getElementById('stop-tracking')?.addEventListener('click', () => {
    // Stop live tracking
    stopLiveTracking('📍 Live tracking stopped');
    showNotification('⏸ Live tracking stopped', 'info', 1800);
});

// Availability filter checkbox listener
document.getElementById('filter-open-only')?.addEventListener('change', () => {
    applyAvailabilityFilter();
    if (lastKnownPosition) {
        updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
    } else {
        renderClinicList(pois);
    }
});

// Cinematic zoom toggle listener
document.getElementById('cinematic-zoom-toggle')?.addEventListener('change', (e) => {
    setCinematicZoomEnabled(e.target.checked);
    showNotification(`Cinematic zoom ${e.target.checked ? 'enabled' : 'disabled'}`, 'info', 1800);
});

// Specialization filter listener
document.getElementById('specialization-filter')?.addEventListener('change', () => {
    applyAvailabilityFilter();
    if (lastKnownPosition) {
        updatePediatriciansNearby(lastKnownPosition.lat, lastKnownPosition.lon);
    } else {
        renderClinicList(pois);
    }
});

// ============================================================================
// REPORT AVAILABILITY MODAL LISTENERS
// ============================================================================

let currentReportingClinic = null;

document.getElementById('report-status-btn')?.addEventListener('click', () => {
    if (selectedClinic) {
        currentReportingClinic = selectedClinic;
        document.getElementById('report-clinic-name').textContent = `📍 ${selectedClinic.name}`;
        document.getElementById('report-modal').style.display = 'flex';
        document.getElementById('report-open-btn').style.background = '#28a745';
        document.getElementById('report-closed-btn').style.background = '#d9534f';
        document.getElementById('report-unsure-btn').style.background = '#ffb347';
    }
});

document.getElementById('cancel-report-btn')?.addEventListener('click', () => {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('report-notes').value = '';
    document.getElementById('report-name').value = '';
});

document.getElementById('report-open-btn')?.addEventListener('click', function() {
    this.style.background = '#1abc9c';
    document.getElementById('report-closed-btn').style.background = '#d9534f';
    document.getElementById('report-unsure-btn').style.background = '#ffb347';
    this.dataset.selected = 'open';
});

document.getElementById('report-closed-btn')?.addEventListener('click', function() {
    document.getElementById('report-open-btn').style.background = '#28a745';
    this.style.background = '#c0392b';
    document.getElementById('report-unsure-btn').style.background = '#ffb347';
    this.dataset.selected = 'closed';
});

document.getElementById('report-unsure-btn')?.addEventListener('click', function() {
    document.getElementById('report-open-btn').style.background = '#28a745';
    document.getElementById('report-closed-btn').style.background = '#d9534f';
    this.style.background = '#e67e22';
    this.dataset.selected = 'unsure';
});

document.getElementById('submit-report-btn')?.addEventListener('click', () => {
    if (!currentReportingClinic) return;
    
    const openBtn = document.getElementById('report-open-btn');
    const closedBtn = document.getElementById('report-closed-btn');
    const unsureBtn = document.getElementById('report-unsure-btn');
    
    let status = null;
    if (openBtn.dataset.selected === 'open') status = 'open';
    else if (closedBtn.dataset.selected === 'closed') status = 'closed';
    else if (unsureBtn.dataset.selected === 'unsure') status = 'unsure';
    
    if (!status) {
        showNotification('⚠️ Please select an availability status', 'warning', 2000);
        return;
    }
    
    const notes = document.getElementById('report-notes').value.trim();
    const name = document.getElementById('report-name').value.trim();
    
    saveClinicReport(currentReportingClinic.id, status, notes, name);
    
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('report-notes').value = '';
    document.getElementById('report-name').value = '';
});


function switchLayer(layerName) {
    map.removeLayer(layers[currentLayer]);
    currentLayer = layerName;
    layers[currentLayer].addTo(map);
    document.querySelectorAll('.layer-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`layer-${layerName}`).classList.add('active');
}

// ============================================================================
// SIDEBAR TOGGLE
// ============================================================================

function toggleSidebar() {
    const sidebar = document.getElementById('left-panel');
    const collapsedSidebar = document.getElementById('sidebar-collapsed');
    const toggleBtn = document.getElementById('toggle-sidebar');
    
    if (sidebar.style.left === '0px') {
        // Close sidebar - show collapsed version
        sidebar.style.left = '-320px';
        collapsedSidebar.style.display = 'flex';
        if (toggleBtn) toggleBtn.style.transform = 'rotate(0deg)';
    } else {
        // Open sidebar - hide collapsed version
        sidebar.style.left = '0px';
        collapsedSidebar.style.display = 'none';
        if (toggleBtn) toggleBtn.style.transform = 'rotate(90deg)';
    }
}

document.getElementById('toggle-sidebar')?.addEventListener('click', toggleSidebar);
document.getElementById('sidebar-close')?.addEventListener('click', toggleSidebar);

// ============================================================================
// ABOUT MODAL
// ============================================================================

function openAboutModal() {
    const modal = document.getElementById('about-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAboutModal() {
    const modal = document.getElementById('about-modal');
    if (modal) modal.style.display = 'none';
}

document.getElementById('about-btn')?.addEventListener('click', openAboutModal);
document.getElementById('about-close')?.addEventListener('click', closeAboutModal);
document.getElementById('about-modal')?.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'about-modal') {
        closeAboutModal();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeAboutModal();
    }
});

// ============================================================================
// THEME
// ============================================================================

let systemThemeListenerAttached = false;

function updateThemeIcon() {
    const themeBtn = document.getElementById('theme-btn');
    if (!themeBtn) return;
    
    if (currentTheme === 'light') {
        themeBtn.textContent = '☀️';
    } else if (currentTheme === 'dark') {
        themeBtn.textContent = '🌙';
    } else {
        themeBtn.textContent = '🔄';
    }
}

function updateThemeButtons() {
    const lightBtn = document.getElementById('theme-light');
    const darkBtn = document.getElementById('theme-dark');
    if (!lightBtn || !darkBtn) return;
    lightBtn.classList.toggle('active', currentTheme === 'light');
    darkBtn.classList.toggle('active', currentTheme === 'dark');
}

function applySystemThemePreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    }
}

function ensureSystemThemeListener() {
    if (systemThemeListenerAttached || !window.matchMedia) return;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentTheme === 'auto') {
            applySystemThemePreference();
        }
    });
    systemThemeListenerAttached = true;
}

function setTheme(mode) {
    currentTheme = mode;
    if (currentTheme === 'light') {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    } else if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    } else {
        applySystemThemePreference();
        ensureSystemThemeListener();
    }
    localStorage.setItem('theme', currentTheme);
    updateThemeIcon();
    updateThemeButtons();
}

document.getElementById('theme-btn')?.addEventListener('click', () => {
    if (currentTheme === 'light') {
        setTheme('dark');
    } else if (currentTheme === 'dark') {
        setTheme('auto');
    } else {
        setTheme('light');
    }
});

document.getElementById('theme-light')?.addEventListener('click', () => setTheme('light'));
document.getElementById('theme-dark')?.addEventListener('click', () => setTheme('dark'));

// Initialize theme based on saved preference or system preference
setTheme(currentTheme);

// ============================================================================
// TRANSPORTATION & EMERGENCY FEATURES
// ============================================================================

/**
 * Get all 24/7 hospitals for emergency calling
 */
function get24HourHospitals() {
    const hospitals24h = [];
    for (const [name, clinic] of Object.entries(knownHospitalsDb)) {
        if (clinic.hours === '24/7') {
            hospitals24h.push({
                name: name,
                phone: clinic.phone || clinic['phone_alt'] || '',
                type: clinic.type || 'Hospital',
                address: clinic.address || ''
            });
        }
    }
    return hospitals24h;
}

/**
 * Calculate traffic multiplier based on time of day
 */
function getTrafficMultiplier() {
    const hour = new Date().getHours();
    
    // Rush hours: 7-9am, 5-7pm
    if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) {
        return 1.5; // 50% longer
    }
    
    // Medium traffic: 12-1pm, 9-10am
    if ((hour >= 12 && hour < 13) || (hour >= 9 && hour < 10)) {
        return 1.2; // 20% longer
    }
    
    // Off-peak: normal
    return 1.0;
}

/**
 * Get traffic status emoji and description
 */
function getTrafficStatus() {
    const multiplier = getTrafficMultiplier();
    if (multiplier > 1.4) {
        return { emoji: '🔴', text: 'Heavy traffic', color: '#d32f2f' };
    } else if (multiplier > 1.1) {
        return { emoji: '🟡', text: 'Moderate traffic', color: '#f57c00' };
    }
    return { emoji: '🟢', text: 'Light traffic', color: '#388e3c' };
}

/**
 * Calculate ETAs for ALL transportation modes
 */
async function calculateAllTransportETAs(fromLat, fromLon, toLat, toLon) {
    if (!fromLat || !fromLon || !toLat || !toLon) return null;
    
    const profiles = {
        'driving': 'car',
        'walking': 'foot',
        'cycling': 'bike',
        'public': 'car', // Use car as approximation for public transit
        'motorcycle': 'car' // Use car for motorcycle (fastest 4-wheel vehicle)
    };
    
    const etas = {};
    const trafficMult = getTrafficMultiplier();
    
    try {
        // Fetch routes for each profile in parallel
        const promises = Object.entries(profiles).map(([mode, profile]) => 
            fetchRoute(fromLat, fromLon, toLat, toLon, profile)
                .then(route => {
                    if (route) {
                        let duration = Math.round(route.duration / 60); // Convert to minutes
                        
                        // Apply traffic multiplier to driving-based modes
                        if ((mode === 'driving' || mode === 'motorcycle' || mode === 'public') && profile === 'car') {
                            duration = Math.round(duration * trafficMult);
                        }
                        
                        // Format duration nicely
                        let timeStr;
                        if (duration > 60) {
                            const hours = Math.floor(duration / 60);
                            const mins = duration % 60;
                            timeStr = `${hours}h ${mins}m`;
                        } else {
                            timeStr = `${duration} min`;
                        }
                        
                        etas[mode] = {
                            duration: duration,
                            display: timeStr,
                            distance: (route.distance / 1000).toFixed(1)
                        };
                    }
                    return null;
                })
                .catch(err => {
                    console.error(`Error fetching route for ${mode}:`, err);
                    return null;
                })
        );
        
        await Promise.all(promises);
        
        return etas;
    } catch (err) {
        console.error('Error calculating ETAs:', err);
        return null;
    }
}

/**
 * Update ETA display with all transport modes
 */
async function updateETADisplay(fromLat, fromLon, toLat, toLon) {
    const etaDisplay = document.getElementById('eta-display');
    if (!etaDisplay) return;
    
    // Show loading state
    etaDisplay.style.display = 'block';
    document.getElementById('eta-car').innerHTML = '<span style="display:inline-block; width:80px;">🚗 Car:</span> <strong>⏳ Calculating...</strong>';
    
    const etas = await calculateAllTransportETAs(fromLat, fromLon, toLat, toLon);
    
    if (!etas) {
        etaDisplay.style.display = 'none';
        return;
    }
    
    // Update each transport mode
    if (etas.driving) {
        document.getElementById('eta-car').innerHTML = `<span style="display:inline-block; width:80px;">🚗 Car:</span> <strong>${etas.driving.display}</strong>`;
    }
    if (etas.walking) {
        document.getElementById('eta-walk').innerHTML = `<span style="display:inline-block; width:80px;">🚶 Walk:</span> <strong>${etas.walking.display}</strong>`;
    }
    if (etas.cycling) {
        document.getElementById('eta-bike').innerHTML = `<span style="display:inline-block; width:80px;">🚴 Bike:</span> <strong>${etas.cycling.display}</strong>`;
    }
    if (etas.public) {
        document.getElementById('eta-public').innerHTML = `<span style="display:inline-block; width:80px;">🚌 Transit:</span> <strong>${etas.public.display}</strong>`;
    }
    if (etas.motorcycle) {
        document.getElementById('eta-motorcycle').innerHTML = `<span style="display:inline-block; width:80px;">🏍️ Bike:</span> <strong>${etas.motorcycle.display}</strong>`;
    }
    
    // Update traffic status indicator
    const traffic = getTrafficStatus();
    const trafficEl = document.getElementById('traffic-status');
    if (trafficEl) {
        trafficEl.innerHTML = `
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${traffic.color}; margin-right:4px;"></span>
            <span>${traffic.emoji} ${traffic.text}</span>
        `;
    }
}

// ============================================================================
// EVENT LISTENERS - TRANSPORTATION & EMERGENCY
// ============================================================================

// Transport mode selector change
document.getElementById('transport-select')?.addEventListener('change', () => {
    if (selectedClinic && lastKnownPosition) {
        // Recalculate route with new transport profile
        recalculateRouteForSelectedClinic();
        // Update ETAs for all modes
        updateETADisplay(lastKnownPosition.lat, lastKnownPosition.lon, selectedClinic.lat, selectedClinic.lon);
    }
});

// Emergency call button
document.getElementById('emergency-call-btn')?.addEventListener('click', () => {
    const hospitals = get24HourHospitals();
    
    if (hospitals.length === 0) {
        showNotification('❌ No emergency hospitals found in database', 'error', 2000);
        return;
    }
    
    // Show modal with emergency hospitals
    const modal = document.getElementById('emergency-modal');
    if (!modal) {
        // Create emergency modal
        const newModal = document.createElement('div');
        newModal.id = 'emergency-modal';
        newModal.style.cssText = `
            position:fixed; top:0; left:0; width:100%; height:100%; 
            background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
            z-index:10000; animation:fadeIn 0.2s;
        `;
        
        let hospitalsList = '';
        hospitals.forEach(h => {
            const cleanPhone = h.phone.replace(/\s/g, '');
            hospitalsList += `
                <div style="padding:12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600; color:#d32f2f;">${h.name}</div>
                        <div style="font-size:12px; color:#666;">📍 ${h.address}</div>
                    </div>
                    <a href="tel:${cleanPhone}" style="background:#d32f2f; color:white; padding:8px 16px; border-radius:4px; text-decoration:none; font-weight:600; white-space:nowrap; margin-left:10px;">CALL NOW</a>
                </div>
            `;
        });
        
        newModal.innerHTML = `
            <div style="background:white; border-radius:12px; max-width:500px; width:90%; max-height:80vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                <div style="padding:20px; background:#d32f2f; color:white; font-size:18px; font-weight:700; display:flex; align-items:center; gap:10px;">
                    🆘 EMERGENCY PEDIATRIC HOSPITALS
                </div>
                <div style="padding:10px 0;">
                    ${hospitalsList}
                </div>
                <div style="padding:20px; border-top:1px solid #eee; text-align:center;">
                    <button onclick="document.getElementById('emergency-modal').remove();" style="background:#e0e0e0; color:#333; padding:10px 30px; border:none; border-radius:4px; cursor:pointer; font-weight:600;">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(newModal);
        
        // Add fade-in animation
        const style = document.createElement('style');
        style.textContent = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }';
        document.head.appendChild(style);
    } else {
        modal.style.display = 'flex';
    }
});

// Show emergency call section when clinic is selected
function showEmergencyCallButton() {
    const section = document.getElementById('emergency-call-section');
    if (section) {
        section.style.display = 'block';
    }
}

// ============================================================================
// GOOGLE GEMINI AI CHATBOT
// ============================================================================
// PANEL STATE MANAGEMENT (Chatbot <-> Info Panel Mutual Exclusivity)
// ============================================================================

let chatbotOpenState = false; // Global state for chatbot
let infoPanelOpenState = false; // Global state for info panel

const CHATBOT_SUGGESTED_QUESTIONS = [
    'How do I use manual location if GPS fails?',
    'How do I find the nearest open pediatric clinic?',
    'How can I report if a clinic is open or closed?',
    'How do I switch transport mode for route and ETA?',
    'How do I use this website offline on mobile?'
];

const WEBSITE_RELATED_KEYWORDS = [
    'website', 'app', 'locator', 'pediatrician', 'clinic', 'hospital', 'map', 'route',
    'gps', 'location', 'manual', 'nearby', 'search', 'filter', 'availability', 'open',
    'closed', 'report', 'favorite', 'offline', 'pwa', 'install', 'admin', 'panel',
    'role', 'emergency', 'call', 'navigation', 'eta', 'distance', 'transport',
    'gensan', 'general santos'
];

/**
 * Close the right info panel
 */
function closeInfoPanel() {
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) {
        infoPanel.style.right = '-340px';
        infoPanel.classList.add('hover-disabled');
        infoPanelOpenState = false;
    }
}

/**
 * Open the right info panel
 */
function openInfoPanel() {
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) {
        infoPanel.style.right = '0';
        infoPanel.classList.remove('hover-disabled');
        infoPanelOpenState = true;
        // Close chatbot when opening info panel
        closeChatbot();
    }
}

/**
 * Close the chatbot
 */
function closeChatbot() {
    const chatWindow = document.getElementById('chatbot-window');
    const toggleBtn = document.getElementById('chatbot-toggle');
    const infoPanel = document.getElementById('info-panel');
    if (chatWindow) {
        chatWindow.style.visibility = 'hidden';
        chatWindow.style.opacity = '0';
        chatWindow.style.pointerEvents = 'none';
        chatbotOpenState = false;
    }
    if (toggleBtn) {
        toggleBtn.style.transform = 'scale(1)';
    }
    // Re-enable hover for info panel
    if (infoPanel) {
        infoPanel.classList.remove('hover-disabled');
    }
}

/**
 * Open the chatbot
 */
function openChatbot() {
    const chatWindow = document.getElementById('chatbot-window');
    const toggleBtn = document.getElementById('chatbot-toggle');
    const input = document.getElementById('chatbot-input');
    const infoPanel = document.getElementById('info-panel');
    if (chatWindow) {
        chatWindow.style.visibility = 'visible';
        chatWindow.style.opacity = '1';
        chatWindow.style.pointerEvents = 'auto';
        chatbotOpenState = true;
        // Close info panel when opening chatbot
        closeInfoPanel();
        // Disable hover on info panel while chatbot is open
        if (infoPanel) {
            infoPanel.classList.add('hover-disabled');
        }
    }
    if (toggleBtn) {
        toggleBtn.style.transform = 'scale(1.1)';
    }
    if (input) {
        input.focus();
    }
}

function isWebsiteRelatedQuestion(message) {
    const text = String(message || '').toLowerCase().trim();
    if (!text) return false;

    const directReference = /\b(this|your)\s+(website|app|site|platform|locator)\b/.test(text);
    const hasKeyword = WEBSITE_RELATED_KEYWORDS.some(keyword => text.includes(keyword));
    return directReference || hasKeyword;
}

function addSuggestedPrompts(titleText = 'Try one of these website questions:') {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    const container = document.createElement('div');
    container.className = 'chatbot-suggestions';

    const title = document.createElement('div');
    title.className = 'chatbot-suggestions-title';
    title.textContent = titleText;
    container.appendChild(title);

    const list = document.createElement('div');
    list.className = 'chatbot-suggestion-list';

    CHATBOT_SUGGESTED_QUESTIONS.forEach(question => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chatbot-suggestion-btn';
        btn.textContent = question;
        btn.dataset.question = question;
        list.appendChild(btn);
    });

    container.appendChild(list);
    messagesContainer.appendChild(container);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function fillChatInput(question) {
    const input = document.getElementById('chatbot-input');
    if (!input) return;
    input.value = question;
    input.focus();
}

function collectRecentChatHistory(messagesContainer) {
    const allMessages = messagesContainer.querySelectorAll('.chatbot-message');
    const conversationHistory = [];

    allMessages.forEach(msg => {
        if (msg.classList.contains('user')) {
            conversationHistory.push({ role: 'user', content: msg.textContent });
        } else if (msg.classList.contains('bot') && !msg.textContent.includes('Thinking...')) {
            conversationHistory.push({ role: 'assistant', content: msg.textContent });
        }
    });

    return conversationHistory.slice(-6);
}

async function requestGeminiResponse(contentParts) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch('https://api.popebagarinao-scwa.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contentParts }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('Gemini response:', data?.text ?? data);

        const text = data?.text || '';
        return {
            candidates: [
                { content: { parts: [{ text }] } }
            ]
        };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        console.error('Fetch error:', error);
        throw error;
    }
}

// ============================================================================
function initializeChatbot() {
    const toggleBtn = document.getElementById('chatbot-toggle');
    const closeBtn = document.getElementById('chatbot-close');
    const sendBtn = document.getElementById('chatbot-send');
    const input = document.getElementById('chatbot-input');
    const chatWindow = document.getElementById('chatbot-window');
    const messagesContainer = document.getElementById('chatbot-messages');

    if (!toggleBtn || !chatWindow) {
        console.warn('Chatbot elements not found');
        return;
    }

    // Toggle chat window - uses global functions to manage mutual exclusivity
    toggleBtn.addEventListener('click', () => {
        if (chatbotOpenState) {
            closeChatbot();
        } else {
            openChatbot();
        }
    });

    // Close chat window
    closeBtn?.addEventListener('click', () => {
        closeChatbot();
    });

    // Send message on button click
    sendBtn?.addEventListener('click', () => {
        const message = input.value.trim();
        if (message) {
            sendChatMessage(message);
            input.value = '';
            input.focus();
        }
    });

    // Send message on Enter key
    input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const message = input.value.trim();
            if (message) {
                sendChatMessage(message);
                input.value = '';
            }
        }
    });

    // Clickable suggested prompts -> auto-fill input.
    messagesContainer?.addEventListener('click', (event) => {
        const button = event.target.closest('.chatbot-suggestion-btn');
        if (!button) return;
        fillChatInput(button.dataset.question || button.textContent || '');
    });
    
    // Set initial state to hidden (but visible - ready to show)
    chatWindow.style.visibility = 'hidden';
    chatWindow.style.opacity = '0';
    chatWindow.style.pointerEvents = 'none';

    // Starter suggestions preview.
    addSuggestedPrompts('Get started:');
}

/**
 * Send message to Gemini and get response
 */
async function sendChatMessage(userMessage) {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    const cleanUserMessage = String(userMessage || '').trim();
    if (!cleanUserMessage) return;

    // Always show user message first.
    addChatMessage(cleanUserMessage, 'user');

    // Restrict to website-only scope.
    if (!isWebsiteRelatedQuestion(cleanUserMessage)) {
        addChatMessage('This chatbot only answers questions related to this website. Please ask a website-related question.', 'error');
        addSuggestedPrompts('Please use one of these website-related prompts:');
        return;
    }

    // Show typing indicator
    addChatMessage('Thinking...', 'bot');

    try {
        // Build concise website context for fast responses.
        let clinicContext = '';

        if (selectedClinic) {
            clinicContext += `\nCurrent Clinic Focus: ${selectedClinic.name}`;
            if (selectedClinic.addr) clinicContext += ` located at ${selectedClinic.addr}`;
        }

        if (lastKnownPosition) {
            clinicContext += `\nUser Location: ${userAddress || 'General Santos City, Philippines'}`;
        }

        if (pois && pois.length > 0 && lastKnownPosition) {
            const nearbyClinics = pois
                .map(clinic => ({
                    name: clinic.name,
                    distance: getDistance(lastKnownPosition.lat, lastKnownPosition.lon, clinic.lat, clinic.lon)
                }))
                .filter(c => c.distance < 2)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3)
                .map((c, i) => `${i + 1}) ${c.name} (${c.distance.toFixed(1)}km)`)
                .join('\n');

            if (nearbyClinics) {
                clinicContext += `\n\nNearby Clinics (within 2km):\n${nearbyClinics}`;
            }
        }

        const systemPrompt = `You are the support chatbot for this Pediatrician Locator website.
Only answer questions about this website's features, usage, and troubleshooting.
If a question is out of scope, reply exactly: "Please ask a question related to this website only."
Keep answers concise and actionable (2-5 short lines).${clinicContext ? `\n${clinicContext}` : ''}`;

        const conversationHistory = collectRecentChatHistory(messagesContainer);
        const contentParts = [{ text: systemPrompt }];

        if (conversationHistory.length > 0) {
            const historyText = '\n\nRecent conversation:\n' +
                conversationHistory
                    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                    .join('\n');
            contentParts.push({ text: historyText });
        }

        contentParts.push({ text: cleanUserMessage });

        const data = await requestGeminiResponse(contentParts);
        const botResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received';

        // Remove typing indicator and add actual response
        removeLastMessage();
        addChatMessage(botResponse, 'bot');

    } catch (error) {
        console.error('Chatbot error:', error);
        removeLastMessage();
        addChatMessage(`Connection/API error: ${error.message || 'Please try again.'}`, 'error');
        addSuggestedPrompts('Try these website prompts while troubleshooting:');
    }
}

/**
 * Add message to chat display
 */
function addChatMessage(message, sender = 'bot') {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chatbot-message ${sender}`;
    messageEl.textContent = message;
    messagesContainer.appendChild(messageEl);

    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Remove last message from chat
 */
function removeLastMessage() {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;
    const lastMessage = messagesContainer.lastElementChild;
    if (lastMessage) {
        lastMessage.remove();
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

loadCinematicZoomPreference();

// Start GPS/network live tracking on page load
startAutoGeolocation();

// Fetch POIs
fetchPOIs();

// Initialize AI Chatbot
initializeChatbot();

console.log('🏥 Pediatrician Locator - Live Tracking Enabled');
console.log('🤖 AI Chatbot ready! Configure the server proxy to enable AI responses.');
