/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MapData, Node, Edge } from './types';
import { findShortestPath, calculateDistance } from './lib/pathfinding';
import ARView from './components/ARView';
import QRScanner from './components/QRScanner';
import AdminPanel from './components/AdminPanel';
import ArrivalNotification from './components/ArrivalNotification';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Navigation, 
  QrCode, 
  Settings, 
  MapPin, 
  Search, 
  ChevronRight,
  WifiOff,
  X,
  Compass,
  BrainCircuit,
  AlertTriangle,
  Download,
  ExternalLink,
  Globe,
  Car,
  Building2,
  Briefcase,
  Stethoscope,
  DoorOpen
} from 'lucide-react';

const MAP_VERSION = '1.6'; // Increment this to force a reset to DEFAULT_MAP

const DEFAULT_MAP: MapData = {
  settings: {
    appName: 'KSUMC Navi',
  },
  nodes: [
    { id: '1', name: 'Administration Building', x:24.711876, y: 46.622209, z: 0, qrCode: 'admin', isAnchor: true, icon: 'admin', color: 'text-purple-500' },
    { id: '2', name: 'Parking', x: 24.710895, y: 46.622153, z: 0, qrCode: 'parking', isAnchor: true, icon: 'parking', color: 'text-orange-500' }, 
    { id: '3', name: 'OPD Building', x: 24.711372, y: 46.621896, z: 0, qrCode: 'opd building', isAnchor: true, icon: 'medical', color: 'text-red-500' },
    { id: '4', name: 'East Building', x: 24.712134, y: 46.622421, z: 0, qrCode: 'east building', isAnchor: true, icon: 'building', color: 'text-yellow-500' },
    { id: '5', name: 'KKUH Entrance', x: 24.711159, y: 46.622387, z: 0, qrCode: 'entrance', isAnchor: true, icon: 'entrance', color: 'text-black-500' },
    { id: '6', name: 'Dental Hospital', x: 24.7149067, y: 46.6225161, z: 0, qrCode: 'dental', isAnchor: true, icon: 'dental', color: 'text-blue-500' },
    { id: '7', name: 'ICU Building', x: 24.7141634, y: 46.6224131, z: 0, qrCode: 'icu', isAnchor: true, icon: 'icu', color: 'text-green-500' },
  ],
  edges: [
    { from: '1', to: '2', distance: 0},
    { from: '2', to: '3', distance: 0},
    { from: '3', to: '4', distance: 0},
    { from: '4', to: '5', distance: 0},
    { from: '5', to: '6', distance: 0},
    { from: '6', to: '7', distance: 0},
    { from: '7', to: '1', distance: 0},
  ]
};

export default function App() {
  const [mapData, setMapData] = useState<MapData>(() => {
    const saved = localStorage.getItem('naviar-map-data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.nodes && parsed.edges) return parsed;
      } catch (e) {
        console.error("Failed to parse saved map data", e);
      }
    }
    return DEFAULT_MAP;
  });
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(() => {
    return localStorage.getItem('naviar-current-node');
  });
  const [destinationNodeId, setDestinationNodeId] = useState<string | null>(() => {
    return localStorage.getItem('naviar-destination-node');
  });
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(() => {
    return localStorage.getItem('naviar-is-navigating') === 'true';
  });
  const [isArrivalOpen, setIsArrivalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiTracingEnabled, setIsAiTracingEnabled] = useState(true);
  const [userLocation, setUserLocation] = useState<{ x: number, y: number, z: number, accuracy: number } | null>(null);
  const [localizationMessage, setLocalizationMessage] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{ type: string, effectiveType: string } | null>(null);
  const [isGpsRequested, setIsGpsRequested] = useState(true);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true);
  const [isIPhone, setIsIPhone] = useState(false);
  const [tracingConfidence, setTracingConfidence] = useState<number>(0);
  const [showAdminButton, setShowAdminButton] = useState(false);
  const [devClickCount, setDevClickCount] = useState(0);

  // Check for admin access, iframe status, and browser support on mount
  useEffect(() => {
    // Monitor network status for Signal Anchoring
    const updateNetworkInfo = () => {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn) {
        setNetworkInfo({
          type: conn.type || 'unknown',
          effectiveType: conn.effectiveType || 'unknown'
        });
      }
    };

    updateNetworkInfo();
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      conn.addEventListener('change', updateNetworkInfo);
    }

    // Force browser to not use disk cache for this session if possible
    // (This is a hint to the browser, not a guarantee)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }

    const ua = navigator.userAgent;
    const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua) && !/OPR/.test(ua);
    const isIosChrome = /CriOS/.test(ua);
    const isIPhoneUA = /iPhone|iPod/.test(ua);
    setIsIPhone(isIPhoneUA);
    
    // Google Chrome is the default and required browser
    const supported = isChrome || isIosChrome;
    setIsSupportedBrowser(supported);

    setIsInIframe(window.self !== window.top);
    setIsSafari(/^((?!chrome|android).)*safari/i.test(ua));
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true' || localStorage.getItem('naviar-admin-mode') === 'true') {
      setShowAdminButton(true);
    }
  }, []);

  const handleDevClick = () => {
    const newCount = devClickCount + 1;
    setDevClickCount(newCount);
    if (newCount >= 7) {
      setShowAdminButton(true);
      localStorage.setItem('naviar-admin-mode', 'true');
      setLocalizationMessage("Admin mode enabled!");
      setTimeout(() => setLocalizationMessage(null), 3000);
      setDevClickCount(0);
    }
  };

  const refreshGps = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    setIsGpsRequested(true);
    setLocalizationMessage("Refreshing GPS signal...");
    setGpsError(null);
    setTimeout(() => setLocalizationMessage(null), 3000);

    const onSuccess = (pos: GeolocationPosition) => {
      setUserLocation({
        x: pos.coords.latitude,
        y: pos.coords.longitude,
        z: 0,
        accuracy: pos.coords.accuracy
      });
      setLocalizationMessage(`GPS Signal Found (±${Math.round(pos.coords.accuracy)}m)`);
      setTimeout(() => setLocalizationMessage(null), 3000);
    };

    const onError = (err: GeolocationPositionError) => {
      console.error("GPS Refresh failed", err);
      if (err.code === 1) {
        if (isInIframe) {
          setGpsError("Safari blocks location in iframes. Please open in a new tab.");
        } else {
          setGpsError("Location permission denied. Please enable it in settings.");
        }
      } else if (err.code === 3) {
        // Try one last time with low accuracy
        navigator.geolocation.getCurrentPosition(onSuccess, (e) => {
          setGpsError("GPS Timeout. Are you indoors? Try moving near a window.");
        }, { enableHighAccuracy: false, timeout: 10000 });
      } else {
        setGpsError("GPS Error: " + err.message);
      }
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, { 
      enableHighAccuracy: true, 
      timeout: 15000, 
      maximumAge: 0 
    });
  };

  const startGps = () => {
    if (isGpsRequested) return;
    setIsGpsRequested(true);
    refreshGps();
  };

  // Persist navigation state
  useEffect(() => {
    if (currentNodeId) localStorage.setItem('naviar-current-node', currentNodeId);
    else localStorage.removeItem('naviar-current-node');
  }, [currentNodeId]);

  useEffect(() => {
    if (destinationNodeId) localStorage.setItem('naviar-destination-node', destinationNodeId);
    else localStorage.removeItem('naviar-destination-node');
  }, [destinationNodeId]);

  useEffect(() => {
    localStorage.setItem('naviar-is-navigating', isNavigating.toString());
  }, [isNavigating]);

  // Geolocation for auto-localization
  useEffect(() => {
    if (!navigator.geolocation || !isGpsRequested) return;

    const options = { 
      enableHighAccuracy: true, 
      timeout: 20000, 
      maximumAge: 0 // Force fresh location data for maximum accuracy
    };

    const handleSuccess = (pos: GeolocationPosition) => {
      setGpsError(null);
      setUserLocation({
        x: pos.coords.latitude,
        y: pos.coords.longitude,
        z: 0,
        accuracy: pos.coords.accuracy
      });
    };

    const handleError = (err: GeolocationPositionError) => {
      console.warn("Geolocation error:", err.message);
      if (err.code === 1) {
        if (isInIframe) {
          setGpsError("Safari blocks location in iframes. Please open in a new tab.");
        } else {
          setGpsError("Permission Denied");
        }
      }
      
      // Fallback for timeout or other errors
      if (err.code === 3 || err.code === 2) {
        navigator.geolocation.getCurrentPosition(handleSuccess, () => {}, {
          enableHighAccuracy: false,
          timeout: 10000
        });
      }
    };

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, options);

    // Kickstart with a single request
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isGpsRequested]);

  // Persist current node
  useEffect(() => {
    if (currentNodeId) {
      localStorage.setItem('naviar-current-node', currentNodeId);
    } else {
      localStorage.removeItem('naviar-current-node');
    }
  }, [currentNodeId]);

  // Load map from localStorage for offline support
  useEffect(() => {
    const savedMap = localStorage.getItem('naviar-map-data');
    const savedVersion = localStorage.getItem('naviar-map-version');

    if (savedMap && savedVersion === MAP_VERSION) {
      try {
        const parsed = JSON.parse(savedMap) as MapData;
        
        // Sync logic: Always update "default" nodes (IDs 1-5) with data from code
        // This ensures that when the developer edits DEFAULT_MAP in code, 
        // the names/coords update on mobile without losing custom nodes.
        const syncedNodes = parsed.nodes.map(savedNode => {
          const defaultNode = DEFAULT_MAP.nodes.find(dn => dn.id === savedNode.id);
          // If it's a default node, take the name and coordinates from code
          if (defaultNode) {
            return { 
              ...savedNode, 
              name: defaultNode.name,
              x: defaultNode.x,
              y: defaultNode.y,
              z: defaultNode.z,
              qrCode: defaultNode.qrCode
            };
          }
          return savedNode;
        });

        // Add any new default nodes that might have been added to code
        DEFAULT_MAP.nodes.forEach(defaultNode => {
          if (!syncedNodes.some(sn => sn.id === defaultNode.id)) {
            syncedNodes.push(defaultNode);
          }
        });

        setMapData({ 
          ...parsed, 
          nodes: syncedNodes,
          settings: parsed.settings || DEFAULT_MAP.settings
        });
      } catch (e) {
        console.error("Failed to parse saved map", e);
        setMapData(DEFAULT_MAP);
      }
    } else {
      // If version mismatch or no saved map, use defaults and save version
      setMapData(DEFAULT_MAP);
      localStorage.setItem('naviar-map-version', MAP_VERSION);
      localStorage.setItem('naviar-map-data', JSON.stringify(DEFAULT_MAP));
    }
  }, []);

  const saveMap = (newMap: MapData) => {
    // Ensure nodes are unique by ID before saving
    const uniqueNodes = Array.from(new Map(newMap.nodes.map(n => [n.id, n])).values());
    const sanitizedMap = { ...newMap, nodes: uniqueNodes };
    
    setMapData(sanitizedMap);
    localStorage.setItem('naviar-map-data', JSON.stringify(sanitizedMap));
    localStorage.setItem('naviar-map-version', MAP_VERSION);
    setIsAdminOpen(false);
  };

  const resetMap = () => {
    setMapData(DEFAULT_MAP);
    localStorage.removeItem('naviar-map-data');
    localStorage.setItem('naviar-map-version', MAP_VERSION);
    setIsAdminOpen(false);
  };

  // AI Signal Tracing Algorithm
  useEffect(() => {
    if (!isAiTracingEnabled || !userLocation || userLocation.accuracy > 40) {
      setTracingConfidence(0);
      return;
    }

    // Find nearest node
    let nearestNode: Node | null = null;
    let minDistance = Infinity;

    mapData.nodes.forEach(node => {
      const dist = calculateDistance(userLocation as unknown as Node, node);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNode = node;
      }
    });

    if (nearestNode && minDistance < 25) {
      // Calculate confidence based on accuracy and distance
      // Higher confidence if accuracy is good and distance is small
      const confidence = Math.max(0, 100 - (minDistance * 2) - (userLocation.accuracy / 2));
      setTracingConfidence(Math.round(confidence));

      // Auto-snap if confidence is high enough
      if (confidence > 70 && (nearestNode as Node).id !== currentNodeId) {
        setCurrentNodeId((nearestNode as Node).id);
      }
    } else {
      setTracingConfidence(0);
    }
  }, [userLocation, isAiTracingEnabled, mapData.nodes, currentNodeId]);

  const handleQRScan = (data: string) => {
    const node = mapData.nodes.find(n => n.qrCode === data);
    if (node) {
      setCurrentNodeId(node.id);
      setIsScanning(false);
    } else {
      alert("Unknown location marker!");
    }
  };

  const startNavigation = (destId: string) => {
    let startId = currentNodeId;

    // Always try to find nearest node if GPS is available and accurate
    if (userLocation && userLocation.accuracy < 50) {
      const nearest = mapData.nodes.reduce((prev, curr) => {
        const distPrev = calculateDistance(userLocation as unknown as Node, prev);
        const distCurr = calculateDistance(userLocation as unknown as Node, curr);
        return distPrev < distCurr ? prev : curr;
      });
      
      // If we are within a reasonable distance of a node (e.g. 100m), use it as start
      if (calculateDistance(userLocation as unknown as Node, nearest) < 100) {
        startId = nearest.id;
        setCurrentNodeId(nearest.id);
      }
    }

    if (!startId) {
      // If no start ID, prompt to scan QR code
      setIsScanning(true);
      setLocalizationMessage("Please scan a QR code to set your starting location.");
      setTimeout(() => setLocalizationMessage(null), 5000);
      return;
    }
    
    if (startId === destId) {
      alert("You are already at this location!");
      return;
    }

    // Refresh state when choosing a new destination
    setLocalizationMessage(null);
    setTracingConfidence(0);

    const path = findShortestPath(mapData, startId, destId);
    if (path.length > 0) {
      setCurrentPath(path);
      setDestinationNodeId(destId);
      setIsNavigating(true);
    } else {
      alert("No path found to destination!");
    }
  };

  const handleCancelNavigation = () => {
    setIsNavigating(false);
    setCurrentPath([]);
    setDestinationNodeId(null);
  };

  // Dynamic path recalculation if user drifts
  useEffect(() => {
    if (!isNavigating || !destinationNodeId || !userLocation || userLocation.accuracy > 30) return;

    // Find the nearest node on the current path
    let minPathDist = Infinity;
    currentPath.forEach(nodeId => {
      const node = mapData.nodes.find(n => n.id === nodeId);
      if (node) {
        const d = calculateDistance(userLocation as unknown as Node, node);
        if (d < minPathDist) minPathDist = d;
      }
    });

    // If we are more than 40m away from the path, recalculate
    // BUT: If we are already close to the destination (< 25m), don't recalculate, just stay locked
    const distToDest = calculateDistance(userLocation as unknown as Node, mapData.nodes.find(n => n.id === destinationNodeId)!);
    
    if (minPathDist > 40 && distToDest > 25) {
      const nearest = mapData.nodes.reduce((prev, curr) => {
        const distPrev = calculateDistance(userLocation as unknown as Node, prev);
        const distCurr = calculateDistance(userLocation as unknown as Node, curr);
        return distPrev < distCurr ? prev : curr;
      });

      const distToNearest = calculateDistance(userLocation as unknown as Node, nearest);
      if (distToNearest < 50) {
        const newPath = findShortestPath(mapData, nearest.id, destinationNodeId);
        if (newPath.length > 0) {
          // Only update if the new path actually improves our situation
          setCurrentNodeId(nearest.id);
          setCurrentPath(newPath);
        }
      }
    }
  }, [userLocation, isNavigating, destinationNodeId, currentPath, mapData]);

  // Update current node as user progresses along the path (forward only)
  useEffect(() => {
    if (!isNavigating || !userLocation || currentPath.length === 0) return;

    const currentIdx = currentPath.indexOf(currentNodeId || "");
    const searchStart = currentIdx !== -1 ? currentIdx : 0;

    // Look ahead in the path for the nearest node
    let bestIdx = searchStart;
    let minDist = calculateDistance(userLocation as unknown as Node, mapData.nodes.find(n => n.id === currentPath[searchStart])!);

    for (let i = searchStart + 1; i < currentPath.length; i++) {
      const node = mapData.nodes.find(n => n.id === currentPath[i]);
      if (node) {
        const d = calculateDistance(userLocation as unknown as Node, node);
        if (d < minDist && d < 15) { // Must be within 15m to "advance" to it
          minDist = d;
          bestIdx = i;
        }
      }
    }

    if (bestIdx > searchStart) {
      setCurrentNodeId(currentPath[bestIdx]);
    }
  }, [userLocation, isNavigating, currentPath, currentNodeId, mapData]);

  const filteredNodes = mapData.nodes.filter(n => 
    n.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getNodeIcon = (node: Node) => {
    // 1. Use explicit node properties if they exist
    if (node.icon || node.color) {
      const iconMap = {
        parking: Car,
        entrance: DoorOpen,
        building: Building2,
        admin: Briefcase,
        medical: Stethoscope,
        dental: Stethoscope,
        icu: Stethoscope,
        default: MapPin
      };
      
      const Icon = iconMap[node.icon || 'default'] || MapPin;
      const colorClass = node.color || 'text-gray-400';
      const bgClass = colorClass.replace('text-', 'bg-').replace('-500', '-50');
      
      return { icon: Icon, color: colorClass, bg: bgClass };
    }

    // 2. Fallback to name-based detection (legacy support)
    const lower = node.name.toLowerCase();
    if (lower.includes('parking')) return { icon: Car, color: 'text-orange-500', bg: 'bg-orange-50' };
    if (lower.includes('entrance')) return { icon: DoorOpen, color: 'text-green-500', bg: 'bg-green-50' };
    if (lower.includes('building')) return { icon: Building2, color: 'text-blue-500', bg: 'bg-blue-50' };
    if (lower.includes('administration')) return { icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-50' };
    if (lower.includes('opd')) return { icon: Stethoscope, color: 'text-red-500', bg: 'bg-red-50' };
    return { icon: MapPin, color: 'text-gray-400', bg: 'bg-gray-50' };
  };

  if (isIPhone && isInIframe) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6 text-center font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full bg-white rounded-[40px] p-10 shadow-2xl"
        >
          <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ExternalLink className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter mb-4 leading-none">
            Open in New Tab
          </h1>
          <p className="text-gray-500 text-sm mb-10 leading-relaxed font-medium">
            iPhone Safari blocks <span className="text-blue-600 font-bold">Location</span> and <span className="text-blue-600 font-bold">Compass</span> access inside previews. Please open the app in a new tab for the full experience.
          </p>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full bg-blue-600 text-white font-black py-6 rounded-3xl shadow-[0_20px_40px_rgba(37,99,235,0.3)] hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
          >
            <ExternalLink className="w-6 h-6" /> Open App Now
          </button>
          <p className="mt-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
            Required for iPhone Sensors
          </p>
        </motion.div>
      </div>
    );
  }

  if (!isSupportedBrowser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full bg-white rounded-[32px] p-8 shadow-2xl border border-gray-100 text-center"
        >
          <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-orange-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mb-4 leading-tight">
            Chrome Required
          </h1>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            Google Chrome is the default and recommended browser for this application. Please switch to Chrome for a better and more convenient experience.
          </p>
          
          <div className="space-y-3">
            <a 
              href="https://www.google.com/chrome/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full bg-blue-600 text-white font-bold py-4 px-6 rounded-2xl hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-200"
            >
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5" />
                <span>Download Chrome</span>
              </div>
              <Download className="w-4 h-4 opacity-50" />
            </a>
          </div>
          
          <p className="mt-8 text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">
            Google Chrome is Required
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        {isNavigating ? (
          <motion.div 
            key="ar-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
          >
            <ARView 
              mapData={mapData}
              currentPath={currentPath}
              currentNodeId={currentNodeId}
              destinationNodeId={destinationNodeId}
              userLocation={userLocation}
              isAiTracingEnabled={isAiTracingEnabled}
              onRefreshGps={refreshGps}
              onArrived={(nodeId) => {
                setCurrentNodeId(nodeId);
                if (nodeId === destinationNodeId) {
                  setIsNavigating(false);
                  setIsArrivalOpen(true);
                }
              }}
            />
            <button 
              onClick={() => {
                // Ensure camera tracks are stopped before closing
                const arjsVideos = document.querySelectorAll('.arjs-video');
                arjsVideos.forEach(v => {
                  if (v instanceof HTMLVideoElement && v.srcObject) {
                    (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                  }
                });
                setIsNavigating(false);
              }}
              className="absolute top-6 right-6 z-50 bg-white/30 backdrop-blur-xl px-6 py-3 rounded-full border border-white/40 text-white hover:bg-white/50 transition-all flex items-center gap-2 font-black text-sm active:scale-95 shadow-2xl"
            >
              <X className="w-4 h-4" /> Exit
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="home-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex-1 overflow-y-auto pt-12 pb-24 px-6 scrollbar-hide"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-10">
              <div>
                <h1 className="text-4xl font-black text-gray-900 tracking-tighter flex flex-col">
                  <div className="flex items-center gap-3">
                    {mapData.settings?.logoUrl && (
                      <img 
                        src={mapData.settings.logoUrl} 
                        alt="App Logo" 
                        className="w-10 h-10 object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span>
                      {mapData.settings?.appName?.split(' ')[0] || 'KSUMC'} 
                      <span className="text-blue-600"> {mapData.settings?.appName?.split(' ').slice(1).join(' ') || 'Navi'}</span>
                    </span>
                  </div>
                  <span 
                    onClick={handleDevClick}
                    className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 select-none active:text-blue-400 transition-colors"
                  >
                    Smart Navigation System - Jeck
                  </span>
                </h1>
              </div>
              {showAdminButton && (
                <button 
                  onClick={() => setIsAdminOpen(true)}
                  className="p-3 bg-white shadow-lg rounded-2xl hover:scale-110 transition-transform active:scale-95 border border-gray-100"
                >
                  <Settings className="w-6 h-6 text-gray-600" />
                </button>
              )}
            </div>

            {/* Current Location Card */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 shadow-2xl shadow-blue-200 mb-8 text-white relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest opacity-80">Current Location</span>
                  </div>
                  {currentNodeId && (
                    <button 
                      onClick={() => setCurrentNodeId(null)}
                      className="text-[10px] font-bold uppercase tracking-widest bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-colors"
                    >
                      Change
                    </button>
                  )}
                </div>
                <h2 className="text-2xl font-bold mb-6">
                  {currentNodeId 
                    ? mapData.nodes.find(n => n.id === currentNodeId)?.name 
                    : "Scan QR to set location"}
                </h2>
                <button 
                  onClick={() => {
                    startGps();
                    setIsScanning(true);
                  }}
                  className="w-full bg-white text-blue-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg hover:bg-blue-50 transition-colors active:scale-95"
                >
                  <QrCode className="w-5 h-5" /> {currentNodeId ? "Update Location" : "Scan QR to Start"}
                </button>
              </div>
            </div>

            {/* Search / Destinations */}
            <div className="mb-6">
              <AnimatePresence>
                {localizationMessage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 p-4 bg-blue-600 text-white rounded-2xl shadow-lg flex items-center gap-3 font-bold text-sm"
                  >
                    <div className="p-2 bg-white/20 rounded-lg">
                      <MapPin className="w-4 h-4" />
                    </div>
                    {localizationMessage}
                  </motion.div>
                )}
                {gpsError && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-4 p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3 font-bold text-sm">
                      <div className="p-2 bg-red-100 rounded-lg">
                        <WifiOff className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p>{gpsError}</p>
                        {isInIframe && isSafari && <p className="text-[10px] opacity-70 mt-1 font-normal">Safari blocks location in iframes. This is a security feature that requires you to open the app in a new tab.</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={refreshGps}
                        className="flex-1 bg-red-600 text-white text-xs font-bold py-2 rounded-xl hover:bg-red-700 transition-colors"
                      >
                        Retry
                      </button>
                      <button 
                        onClick={() => window.open(window.location.href, '_blank')}
                        className="flex-1 bg-white border border-red-200 text-red-600 text-xs font-bold py-2 rounded-xl hover:bg-red-50 transition-colors shadow-sm"
                      >
                        Open in New Tab
                      </button>
                    </div>
                  </motion.div>
                )}
                {!userLocation && !gpsError && !isGpsRequested && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 p-4 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3 font-bold text-sm">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Navigation className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p>GPS is currently inactive.</p>
                        <p className="text-[10px] opacity-70 mt-1">Enable GPS for automatic indoor positioning.</p>
                      </div>
                    </div>
                    <button 
                      onClick={startGps}
                      className="w-full bg-blue-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                    >
                      Enable GPS Navigation
                    </button>
                  </motion.div>
                )}
                {!userLocation && !gpsError && isGpsRequested && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 p-3 bg-gray-100 text-gray-500 rounded-2xl flex items-center gap-3 text-xs font-bold"
                  >
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                    <div className="flex-1">
                      <p>Searching for GPS signal...</p>
                      <p className="text-[9px] opacity-70 font-normal">iOS Safari users: If this takes too long, try <strong>opening in a new tab</strong>.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Where are you going?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-100 shadow-sm rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
                <button 
                  onClick={() => setIsAiTracingEnabled(!isAiTracingEnabled)}
                  className={`flex flex-col items-center justify-center gap-1 px-6 py-3 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border ${
                    isAiTracingEnabled 
                      ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <BrainCircuit className={`w-5 h-5 ${isAiTracingEnabled ? "animate-pulse" : ""}`} />
                  <div className="flex flex-col items-center leading-tight">
                    <span>Smart View Detection: {isAiTracingEnabled ? "ON" : "OFF"}</span>
                    <span className="text-[8px] opacity-100 font-black">التوجيه البصري بالذكاء الاصطناعي</span>
                  </div>
                </button>

                {userLocation && (
                  <div className="flex flex-col items-center justify-center gap-1 px-6 py-3 rounded-2xl bg-green-50 border border-green-100 text-green-700 text-xs font-bold transition-all animate-in fade-in slide-in-from-left-4">
                    <Navigation className="w-5 h-5 animate-pulse" />
                    <div className="flex flex-col items-center leading-tight">
                      <span>GPS ON</span>
                      <span className="text-[8px] opacity-70">±{Math.round(userLocation.accuracy)}m Accuracy</span>
                    </div>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">Popular Destinations</h3>
              <div className="space-y-3">
                {filteredNodes.map(node => {
                  const isCurrent = node.id === currentNodeId;
                  const { icon: IconComponent, color, bg } = getNodeIcon(node);
                  
                  return (
                    <button 
                      key={node.id}
                      disabled={isCurrent && !!currentNodeId}
                      onClick={() => startNavigation(node.id)}
                      className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all group active:scale-[0.98] ${
                        isCurrent 
                          ? "bg-blue-50 border-blue-200 opacity-80 cursor-default" 
                          : "bg-white border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl transition-colors ${isCurrent ? "bg-blue-100" : bg}`}>
                          <IconComponent className={`w-5 h-5 ${isCurrent ? "text-blue-600" : color}`} />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className={`font-bold ${isCurrent ? "text-blue-900" : "text-gray-800"}`}>{node.name}</p>
                            {node.isAnchor && (
                              <div className="bg-blue-100 text-blue-600 p-1 rounded-md" title="High-precision Anchor">
                                <Compass className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {isCurrent 
                              ? "You are here" 
                              : !currentNodeId 
                                ? "Scan QR to set start" 
                                : "Navigate to this destination"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isCurrent && (
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                            {!currentNodeId ? "Scan QR" : "Go"}
                          </span>
                        )}
                        <ChevronRight className={`w-5 h-5 ${isCurrent ? "text-blue-300" : "text-gray-300 group-hover:text-blue-500 transition-colors"}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Offline Badge & Camera Note */}
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <WifiOff className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Offline Ready</span>
              </div>
              <p className="text-[10px] text-gray-400 text-center px-8 leading-relaxed">
                If the camera doesn't load, please ensure you've granted camera permissions and try <strong>opening in a new tab</strong>.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            key="qr-scanner-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 h-[100dvh] z-50"
          >
            <QRScanner 
              onScan={handleQRScan} 
              onClose={() => setIsScanning(false)} 
            />
          </motion.div>
        )}
        {isAdminOpen && (
          <motion.div
            key="admin-panel-overlay"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 h-[100dvh] z-[60]"
          >
            <AdminPanel 
              mapData={mapData} 
              userLocation={userLocation}
              onSave={saveMap} 
              onClose={() => setIsAdminOpen(false)} 
              onTestArrival={() => setIsArrivalOpen(true)}
              onReset={resetMap}
              onSetCurrentNode={(nodeId) => {
                setCurrentNodeId(nodeId);
                setIsAdminOpen(false);
              }}
            />
          </motion.div>
        )}
        <ArrivalNotification 
          isOpen={isArrivalOpen}
          onClose={() => setIsArrivalOpen(false)}
          destinationName={mapData.nodes.find(n => n.id === destinationNodeId)?.name || "Your Destination"}
        />
      </AnimatePresence>

      {/* Navigation Bar (Floating) */}
      {!isNavigating && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-auto min-w-[200px] z-30 px-6">
          <div className="bg-white/90 backdrop-blur-2xl border border-white/50 rounded-full p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex justify-center items-center gap-4 px-4">
            <button 
              onClick={() => setIsScanning(true)} 
              className="p-4 text-blue-600 bg-blue-50 rounded-full transition-all hover:bg-blue-100 active:scale-90 shadow-sm"
              title="Scan QR Code"
            >
              <QrCode className="w-6 h-6" />
            </button>
            {showAdminButton && (
              <button 
                onClick={() => setIsAdminOpen(true)} 
                className="p-4 text-gray-400 hover:text-blue-600 transition-all hover:bg-gray-50 rounded-full active:scale-90"
                title="Settings"
              >
                <Settings className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
