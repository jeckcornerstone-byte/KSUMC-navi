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
  BrainCircuit
} from 'lucide-react';

const MAP_VERSION = '1.6'; // Increment this to force a reset to DEFAULT_MAP

const DEFAULT_MAP: MapData = {
  nodes: [
    { id: '1', name: 'Administration Building', x:24.7117215, y: 46.6225812, z: 0, qrCode: 'admin', isAnchor: true },
    { id: '2', name: 'Parking', x: 24.7117116, y: 46.6225909, z: 0, qrCode: 'parking', isAnchor: true }, 
    { id: '3', name: 'OPD Building', x: 24.7117253, y: 46.6225209, z: 0, qrCode: 'opd building', isAnchor: true },
    { id: '4', name: 'East Building', x: 24.7757, y: 46.8020, z: 0, qrCode: 'east building', isAnchor: true },
    { id: '5', name: 'Main Entrance', x: 24.7756308, y: 46.8018328, z: 0, qrCode: 'entrance', isAnchor: true },
  ],
  edges: [
    { from: '1', to: '2', distance: 0},
    { from: '2', to: '3', distance: 0},
    { from: '3', to: '4', distance: 0},
    { from: '4', to: '5', distance: 0},
    { from: '5', to: '1', distance: 0},
  ]
};

export default function App() {
  const [mapData, setMapData] = useState<MapData>(DEFAULT_MAP);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(() => {
    return localStorage.getItem('naviar-current-node');
  });
  const [destinationNodeId, setDestinationNodeId] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isArrivalOpen, setIsArrivalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiTracingEnabled, setIsAiTracingEnabled] = useState(true);
  const [userLocation, setUserLocation] = useState<{ x: number, y: number, z: number, accuracy: number } | null>(null);
  const [localizationMessage, setLocalizationMessage] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGpsRequested, setIsGpsRequested] = useState(true);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [tracingConfidence, setTracingConfidence] = useState<number>(0);
  const [showAdminButton, setShowAdminButton] = useState(false);
  const [devClickCount, setDevClickCount] = useState(0);

  // Check for admin access and iframe status on mount
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
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

  // Geolocation for auto-localization
  useEffect(() => {
    if (!navigator.geolocation || !isGpsRequested) return;

    const options = { 
      enableHighAccuracy: true, 
      timeout: 20000, 
      maximumAge: 10000 
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
    const savedMap = localStorage.getItem('naviar-map');
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

        setMapData({ ...parsed, nodes: syncedNodes });
      } catch (e) {
        console.error("Failed to parse saved map", e);
        setMapData(DEFAULT_MAP);
      }
    } else {
      // If version mismatch or no saved map, use defaults and save version
      setMapData(DEFAULT_MAP);
      localStorage.setItem('naviar-map-version', MAP_VERSION);
      localStorage.setItem('naviar-map', JSON.stringify(DEFAULT_MAP));
    }
  }, []);

  const saveMap = (newMap: MapData) => {
    // Ensure nodes are unique by ID before saving
    const uniqueNodes = Array.from(new Map(newMap.nodes.map(n => [n.id, n])).values());
    const sanitizedMap = { ...newMap, nodes: uniqueNodes };
    
    setMapData(sanitizedMap);
    localStorage.setItem('naviar-map', JSON.stringify(sanitizedMap));
    localStorage.setItem('naviar-map-version', MAP_VERSION);
    setIsAdminOpen(false);
  };

  const resetMap = () => {
    setMapData(DEFAULT_MAP);
    localStorage.removeItem('naviar-map');
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

    // If we are more than 30m away from the path, recalculate
    if (minPathDist > 30) {
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

  const filteredNodes = mapData.nodes.filter(n => 
    n.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100">
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
              onClick={() => setIsNavigating(false)}
              className="absolute top-6 right-6 z-50 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/30 text-white hover:bg-white/40 transition-all flex items-center gap-2 font-bold text-sm"
            >
              <X className="w-4 h-4" /> Exit
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="home-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto px-6 pt-12 pb-24"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-10">
              <div>
                <h1 className="text-4xl font-black text-gray-900 tracking-tighter flex flex-col">
                  <span>KSUMC <span className="text-blue-600">Navi</span></span>
                  <span 
                    onClick={handleDevClick}
                    className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 select-none active:text-blue-400 transition-colors"
                  >
                    Indoor navigation system made by Jeck
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
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                    isAiTracingEnabled 
                      ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <BrainCircuit className={`w-4 h-4 ${isAiTracingEnabled ? "animate-pulse" : ""}`} />
                  <div className="flex flex-col items-start leading-none">
                    <span>AI Visual Guidance: {isAiTracingEnabled ? "ON" : "OFF"}</span>
                    <span className="text-[8px] opacity-70">التوجيه البصري بالذكاء الاصطناعي</span>
                  </div>
                </button>
              </div>

              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">Popular Destinations</h3>
              <div className="space-y-3">
                {filteredNodes.map(node => {
                  const isCurrent = node.id === currentNodeId;
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
                        <div className={`p-3 rounded-xl transition-colors ${isCurrent ? "bg-blue-100" : "bg-gray-50 group-hover:bg-blue-50"}`}>
                          <Navigation className={`w-5 h-5 ${isCurrent ? "text-blue-600" : "text-gray-400 group-hover:text-blue-500"}`} />
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
            className="fixed inset-0 z-50"
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
            className="fixed inset-0 z-[60]"
          >
            <AdminPanel 
              mapData={mapData} 
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
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xs px-4 z-30">
          <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-full p-2 shadow-2xl flex justify-around items-center">
            <button onClick={() => setIsScanning(true)} className="p-4 text-blue-600 bg-blue-50 rounded-full transition-all hover:bg-blue-100">
              <QrCode className="w-6 h-6" />
            </button>
            {showAdminButton && (
              <button onClick={() => setIsAdminOpen(true)} className="p-4 text-gray-400 hover:text-blue-600 transition-colors">
                <Settings className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
