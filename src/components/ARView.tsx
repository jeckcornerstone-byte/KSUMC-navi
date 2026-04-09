import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Node, MapData } from '../types';
import { calculateDistance } from '../lib/pathfinding';
import { motion, AnimatePresence, useSpring } from 'motion/react';
import { Navigation, Compass, MapPin, ArrowUp, WifiOff, CheckCircle2, Sparkles, BrainCircuit } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ARViewProps {
  mapData: MapData;
  currentPath: string[];
  currentNodeId: string | null;
  destinationNodeId: string | null;
  userLocation: { x: number, y: number, z: number, accuracy: number } | null;
  isAiTracingEnabled?: boolean;
  onArrived: (nodeId: string) => void;
  onRefreshGps?: () => void;
}

export default function ARView({ 
  mapData, 
  currentPath, 
  currentNodeId, 
  destinationNodeId,
  userLocation,
  isAiTracingEnabled,
  onArrived,
  onRefreshGps
}: ARViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [heading, setHeading] = useState<number>(0);
  const [distanceToNext, setDistanceToNext] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTriggeredArrival, setHasTriggeredArrival] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState<boolean | null>(null);
  const [isLowAccuracy, setIsLowAccuracy] = useState(false);
  const [isAnchored, setIsAnchored] = useState(false);
  const [nearbyAnchor, setNearbyAnchor] = useState<Node | null>(null);
  const [aiInstruction, setAiInstruction] = useState<{ en: string, ar: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }), []);

  const captureFrame = () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
  };

  // AI Visual Guidance Logic
  useEffect(() => {
    if (!isAiTracingEnabled || !destinationNodeId || hasTriggeredArrival || !isPermissionGranted) {
      setAiInstruction(null);
      return;
    }

    const analyzeEnvironment = async () => {
      if (isAnalyzing) return;
      const frame = captureFrame();
      if (!frame) return;

      setIsAnalyzing(true);
      try {
        const destNode = mapData.nodes.find(n => n.id === destinationNodeId);
        const currNode = mapData.nodes.find(n => n.id === currentNodeId);
        
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: frame, mimeType: "image/jpeg" } },
              { text: `You are an indoor navigation assistant at KSUMC hospital. 
                The user is currently at or near "${currNode?.name || 'Unknown'}" and heading to "${destNode?.name || 'Destination'}".
                Based on this camera view of their surroundings, provide a short, clear, and helpful navigation instruction in both English and Arabic.
                If you see specific hospital signs, doors, or landmarks in the image, use them to guide the user.
                Keep it concise and direct (max 8 words per language).
                Return the result as a JSON object with "en" and "ar" keys.` }
            ]
          },
          config: {
            responseMimeType: "application/json"
          }
        });
        
        if (response.text) {
          try {
            const parsed = JSON.parse(response.text);
            if (parsed.en && parsed.ar) {
              setAiInstruction(parsed);
            }
          } catch (e) {
            console.error("Failed to parse AI response", e);
            setAiInstruction({ 
              en: response.text.split('\n')[0] || "Continue following the arrow", 
              ar: "استمر في اتباع السهم" 
            });
          }
        }
      } catch (e) {
        console.error("AI Visual Guidance Error:", e);
      } finally {
        setIsAnalyzing(false);
      }
    };

    const interval = setInterval(analyzeEnvironment, 10000); // Every 10 seconds
    analyzeEnvironment(); // Run once immediately

    return () => clearInterval(interval);
  }, [isAiTracingEnabled, destinationNodeId, hasTriggeredArrival, isPermissionGranted, mapData.nodes, currentNodeId, ai]);

  // Smoothing for heading, location, and distance
  const smoothHeading = useSpring(0, { stiffness: 120, damping: 45 });
  const smoothLat = useSpring(userLocation?.x || 0, { stiffness: 150, damping: 40 });
  const smoothLng = useSpring(userLocation?.y || 0, { stiffness: 150, damping: 40 });
  const smoothDistance = useSpring(0, { stiffness: 120, damping: 35 });
  const smoothBearing = useSpring(0, { stiffness: 120, damping: 35 });

  const isFirstHeading = useRef(true);
  const isFirstPos = useRef(true);
  const isFirstBearing = useRef(true);
  const lastSnappedAnchorId = useRef<string | null>(null);

  // Accuracy-weighted position filtering
  const [filteredPos, setFilteredPos] = useState<{ x: number, y: number, z: number } | null>(null);

  // Reset arrival trigger when current node changes
  useEffect(() => {
    setHasTriggeredArrival(false);

    // Anchor Snapping Logic: If the new current node is an anchor, jump the position to it
    if (currentNodeId) {
      const node = mapData.nodes.find(n => n.id === currentNodeId);
      if (node?.isAnchor && currentNodeId !== lastSnappedAnchorId.current) {
        lastSnappedAnchorId.current = currentNodeId;
        setFilteredPos({ x: node.x, y: node.y, z: node.z });
        smoothLat.jump(node.x);
        smoothLng.jump(node.y);
        setIsAnchored(true);
        setTimeout(() => setIsAnchored(false), 3000);
      }
    }
  }, [currentNodeId, mapData.nodes, smoothLat, smoothLng]);

  const handleManualSnap = (node: Node) => {
    lastSnappedAnchorId.current = node.id;
    setFilteredPos({ x: node.x, y: node.y, z: node.z });
    smoothLat.jump(node.x);
    smoothLng.jump(node.y);
    setIsAnchored(true);
    setTimeout(() => setIsAnchored(false), 3000);
  };

  // Nearby Anchor Detection & Auto-Snap
  useEffect(() => {
    if (!filteredPos) return;
    
    const nearest = mapData.nodes
      .filter(n => n.isAnchor || n.id === destinationNodeId)
      .map(n => ({ node: n, dist: calculateDistance(filteredPos as any, n) }))
      .filter(n => n.dist < 12) // Detect within 12m
      .sort((a, b) => a.dist - b.dist)[0];

    // Auto-snap if very close (< 5m) and not recently snapped to this same node
    if (nearest && nearest.dist < 5 && nearest.node.id !== lastSnappedAnchorId.current) {
      handleManualSnap(nearest.node);
    }

    setNearbyAnchor(nearest?.node || null);
  }, [filteredPos, mapData.nodes, destinationNodeId]);

  // Camera setup
  useEffect(() => {
    async function setupCamera() {
      if (!videoRef.current) return;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API not supported in this browser.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        videoRef.current.srcObject = stream;
        setCameraError(null);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setCameraError(err instanceof Error ? err.message : "Could not access camera.");
      }
    }
    setupCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Device Orientation setup
  useEffect(() => {
    let lastHeading = 0;
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let h: number | null = null;

      // 1. Try iOS absolute heading
      if ((e as any).webkitCompassHeading !== undefined) {
        h = (e as any).webkitCompassHeading;
      } 
      // 2. Try Android absolute heading (if absolute: true was set or using deviceorientationabsolute)
      else if (e.absolute && e.alpha !== null) {
        h = 360 - e.alpha;
      }
      // 3. Fallback to relative alpha
      else if (e.alpha !== null) {
        h = 360 - e.alpha;
      }

      if (h !== null) {
        if (isFirstHeading.current) {
          smoothHeading.jump(h);
          isFirstHeading.current = false;
        }

        // Handle 0/360 jump for smooth rotation
        let diff = h - lastHeading;
        if (diff > 180) h -= 360;
        else if (diff < -180) h += 360;
        
        lastHeading = h;
        setHeading(h);
        smoothHeading.set(h);
      }
    };

    // Use deviceorientationabsolute for Android if available
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';

    const handleOrientationWrapper = (e: any) => handleOrientation(e);

    if (isPermissionGranted) {
      window.addEventListener(eventName, handleOrientationWrapper, true);
    }

    return () => {
      window.removeEventListener(eventName, handleOrientationWrapper);
    };
  }, [isPermissionGranted]);

  const requestPermissions = async () => {
    // Request Camera
    try {
      await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      console.error("Camera permission denied", e);
    }

    // Request Orientation
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const state = await (DeviceOrientationEvent as any).requestPermission();
        setIsPermissionGranted(state === 'granted');
      } catch (e) {
        console.error("Orientation permission error", e);
        setIsPermissionGranted(false);
      }
    } else {
      setIsPermissionGranted(true);
    }
  };

  // Movement detection using accelerometer
  const [isMoving, setIsMoving] = useState(false);
  const lastAccel = useRef<{ x: number, y: number, z: number } | null>(null);

  useEffect(() => {
    const handleMotion = (e: DeviceMotionEvent) => {
      if (!e.accelerationIncludingGravity) return;
      
      const { x, y, z } = e.accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      if (lastAccel.current) {
        // Calculate change in acceleration (jerk/movement)
        const delta = Math.sqrt(
          Math.pow(x - lastAccel.current.x, 2) +
          Math.pow(y - lastAccel.current.y, 2) +
          Math.pow(z - lastAccel.current.z, 2)
        );
        
        // Threshold for human walking movement
        setIsMoving(delta > 0.8);
      }
      lastAccel.current = { x, y, z };
    };

    window.addEventListener('devicemotion', handleMotion, true);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, []);

  // Update smoothing springs when userLocation prop changes
  useEffect(() => {
    if (userLocation) {
      // 1. Path Snapping Logic
      let targetX = userLocation.x;
      let targetY = userLocation.y;
      let targetZ = userLocation.z;

      if (currentPath.length >= 2) {
        // Find the nearest segment on the current path to snap to
        let minSnapDist = Infinity;
        let bestSnapX = targetX;
        let bestSnapY = targetY;

        for (let i = 0; i < currentPath.length - 1; i++) {
          const n1 = mapData.nodes.find(n => n.id === currentPath[i]);
          const n2 = mapData.nodes.find(n => n.id === currentPath[i+1]);
          if (!n1 || !n2) continue;

          // Simple Euclidean projection (fine for small indoor distances)
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          if (dx === 0 && dy === 0) continue;

          const t = Math.max(0, Math.min(1, ((targetX - n1.x) * dx + (targetY - n1.y) * dy) / (dx * dx + dy * dy)));
          const snapX = n1.x + t * dx;
          const snapY = n1.y + t * dy;
          
          // Use calculateDistance to get real meters for the snap check
          const dist = calculateDistance({ x: targetX, y: targetY, z: targetZ } as any, { x: snapX, y: snapY, z: targetZ } as any);
          
          if (dist < minSnapDist) {
            minSnapDist = dist;
            bestSnapX = snapX;
            bestSnapY = snapY;
          }
        }

        // Only snap if we are reasonably close to the path (e.g., within 15m)
        if (minSnapDist < 15) {
          targetX = bestSnapX;
          targetY = bestSnapY;
        }
      }

      // 2. Accuracy-Weighted Moving Average + Movement Awareness
      // Base trust factor based on accuracy
      let trustFactor = Math.max(0.1, Math.min(0.9, 15 / userLocation.accuracy));
      
      if (isMoving) {
        // When moving, we want to be MORE responsive to catch turns and path changes
        trustFactor = Math.min(0.95, trustFactor * 1.5);
      } else if (userLocation.accuracy > 10) {
        // When stationary, we penalize jumps to avoid "jitter"
        trustFactor *= 0.3; 
      }
      
      setFilteredPos(prev => {
        if (!prev) return { x: targetX, y: targetY, z: targetZ };
        
        if (isFirstPos.current) {
          smoothLat.jump(targetX);
          smoothLng.jump(targetY);
          isFirstPos.current = false;
        }

        return {
          x: prev.x + (targetX - prev.x) * trustFactor,
          y: prev.y + (targetY - prev.y) * trustFactor,
          z: prev.z + (targetZ - prev.z) * trustFactor
        };
      });

      setIsLowAccuracy(userLocation.accuracy > 20);
    }
  }, [userLocation, currentPath, mapData, isMoving]);

  // Update springs from filtered position
  useEffect(() => {
    if (filteredPos) {
      smoothLat.set(filteredPos.x);
      smoothLng.set(filteredPos.y);

      // Auto-lock visual state when very close to destination
      if (destinationNodeId) {
        const destNode = mapData.nodes.find(n => n.id === destinationNodeId);
        if (destNode) {
          const dist = calculateDistance(filteredPos as any, destNode);
          if (dist < 3) {
            setIsAnchored(true);
          }
        }
      }
    }
  }, [filteredPos, smoothLat, smoothLng, destinationNodeId, mapData.nodes]);

  // Navigation Logic & Continuous Bearing Calculation
  useEffect(() => {
    let rafId: number;

    const updateNavigation = () => {
      if (!currentNodeId) {
        rafId = requestAnimationFrame(updateNavigation);
        return;
      }

      const currentNode = mapData.nodes.find(n => n.id === currentNodeId);
      const finalTargetNode = mapData.nodes.find(n => n.id === destinationNodeId);

      if (finalTargetNode && currentNode) {
        // Use filtered position for navigation logic
        let fromPos: Node = currentNode as Node;
        if (filteredPos) {
          fromPos = { 
            ...currentNode, 
            x: filteredPos.x, 
            y: filteredPos.y,
            z: filteredPos.z
          } as Node;
        }

        // Waypoint Logic: Point to the next node in the path
        let targetNode = finalTargetNode;
        if (currentPath.length > 1) {
          // Find the user's current progress in the path
          const currentIdx = currentPath.indexOf(currentNodeId || "");
          const searchStartIdx = currentIdx !== -1 ? currentIdx : 0;

          // Find the first node in the path after the current one that is "ahead" of us
          let nextIdx = searchStartIdx;
          let found = false;
          for (let i = searchStartIdx; i < currentPath.length; i++) {
            const node = mapData.nodes.find(n => n.id === currentPath[i]);
            if (node) {
              const d = calculateDistance(fromPos, node);
              // If node is > 5m away, it's our next target
              if (d > 5) { 
                nextIdx = i;
                found = true;
                break;
              }
            }
          }
          // If all remaining nodes are < 5m, point to the final destination
          if (!found) nextIdx = currentPath.length - 1;
          
          targetNode = mapData.nodes.find(n => n.id === currentPath[nextIdx]) || finalTargetNode;
        }

        const dist = calculateDistance(fromPos, finalTargetNode);
        setDistanceToNext(dist);
        smoothDistance.set(dist);

        // Calculate bearing to the NEXT waypoint
        const isGPS = (Math.abs(fromPos.x) > 0.01 && Math.abs(fromPos.x) <= 90) && 
                      (Math.abs(fromPos.y) > 0.01 && Math.abs(fromPos.y) <= 180);

        let bearing = 0;
        if (isGPS) {
          const φ1 = fromPos.x * Math.PI / 180;
          const φ2 = targetNode.x * Math.PI / 180;
          const Δλ = (targetNode.y - fromPos.y) * Math.PI / 180;
          const y = Math.sin(Δλ) * Math.cos(φ2);
          const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
          bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        } else {
          // For relative meters: 0 is North (+Y), 90 is East (+X)
          const dx = targetNode.x - fromPos.x;
          const dy = targetNode.y - fromPos.y;
          bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        }
        
        // Handle 0/360 jump for bearing
        let lastB = smoothBearing.get();
        if (isFirstBearing.current) {
          smoothBearing.jump(bearing);
          isFirstBearing.current = false;
        }
        let diff = bearing - lastB;
        if (diff > 180) bearing -= 360;
        else if (diff < -180) bearing += 360;
        smoothBearing.set(bearing);

        // Automatic arrival trigger if very close to final destination (< 1.5m)
        if (dist < 1.5 && !hasTriggeredArrival) {
          setHasTriggeredArrival(true);
          // We don't call onArrived immediately here, we let the user click the "Finish" button in the overlay
        }
      }
      rafId = requestAnimationFrame(updateNavigation);
    };

    rafId = requestAnimationFrame(updateNavigation);
    return () => cancelAnimationFrame(rafId);
  }, [currentNodeId, currentPath, mapData, userLocation, smoothLat, smoothLng, smoothBearing, smoothDistance, hasTriggeredArrival, onArrived]);

  const [arrowRotation, setArrowRotation] = useState(0);
  useEffect(() => {
    let rafId: number;
    const updateRotation = () => {
      let diff = smoothBearing.get() - smoothHeading.get();
      // Normalize to -180 to 180
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      setArrowRotation(diff);
      rafId = requestAnimationFrame(updateRotation);
    };
    rafId = requestAnimationFrame(updateRotation);
    return () => cancelAnimationFrame(rafId);
  }, [smoothHeading, smoothBearing]);

  // Smoothed distance for display
  const [displayDistance, setDisplayDistance] = useState("0.0");
  useEffect(() => {
    return smoothDistance.on("change", (v) => {
      setDisplayDistance(v.toFixed(1));
    });
  }, [smoothDistance]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Permission Overlay */}
      <AnimatePresence>
        {isPermissionGranted === null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-gray-900 flex items-center justify-center p-8 text-center"
          >
            <div className="max-w-xs">
              <div className="bg-blue-600/20 p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <Compass className="w-12 h-12 text-blue-500 animate-pulse" />
              </div>
              <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Ready to Navigate?</h2>
              <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                We need access to your camera and motion sensors to provide accurate AR guidance.
              </p>
              <button 
                onClick={requestPermissions}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-900/40 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Navigation className="w-5 h-5" /> Start AR View
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arrival Modern Interface Overlay */}
      <AnimatePresence>
        {hasTriggeredArrival && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[110] bg-blue-600 flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="bg-white p-8 rounded-full mb-8 shadow-[0_0_80px_rgba(255,255,255,0.4)]"
            >
              <CheckCircle2 className="w-24 h-24 text-blue-600" />
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-5xl font-black text-white mb-4 tracking-tighter">You've Arrived!</h2>
              <p className="text-blue-100 text-xl mb-12 max-w-xs mx-auto leading-relaxed">
                You've successfully reached <span className="font-bold text-white underline decoration-white/30 underline-offset-8">{mapData.nodes.find(n => n.id === destinationNodeId)?.name}</span>.
              </p>
            </motion.div>
            
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              onClick={() => onArrived(destinationNodeId!)}
              className="bg-white text-blue-600 font-black py-5 px-14 rounded-3xl shadow-2xl hover:bg-blue-50 transition-all active:scale-95 flex items-center gap-3 text-lg"
            >
              <Navigation className="w-6 h-6 rotate-45" /> Finish Trip
            </motion.button>
            
            {/* Decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-white rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-white rounded-full blur-3xl" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Background */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-100"
      />

      {/* Camera Error Message */}
      <AnimatePresence>
        {cameraError && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-20 p-8 text-center"
          >
            <div className="max-w-xs">
              <div className="bg-red-500/20 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <WifiOff className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Camera Error</h3>
              <p className="text-gray-400 text-sm mb-6">
                {cameraError}. This often happens in iFrame previews.
              </p>
              <div className="space-y-3">
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl"
                >
                  Retry Camera
                </button>
                <p className="text-xs text-gray-500">
                  Tip: Try opening the app in a <strong>new tab</strong> if the preview camera fails.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AR Overlay UI */}
      <div className="absolute inset-0 flex flex-col items-center justify-between p-8 pointer-events-none">
        
        {/* Top Info */}
        <div className="w-full flex flex-col gap-3">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-5 flex items-center gap-4 shadow-2xl"
          >
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/40 shrink-0">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-0.5">Heading To</p>
                <AnimatePresence>
                  {isAnchored && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="bg-green-500 text-[8px] text-white font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter"
                    >
                      Locked
                    </motion.span>
                  )}
                  {isAiTracingEnabled && !isAnchored && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-blue-500/50 backdrop-blur-md text-[8px] text-white font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-1"
                    >
                      <BrainCircuit className="w-2 h-2 animate-pulse" /> AI Tracing
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-xl font-black text-white truncate leading-tight">
                {mapData.nodes.find(n => n.id === destinationNodeId)?.name || "Destination"}
              </p>
            </div>
          </motion.div>

          {/* AI Visual Instruction Overlay */}
          <AnimatePresence>
            {aiInstruction && isAiTracingEnabled && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="w-full bg-blue-600/90 backdrop-blur-xl border border-blue-400/30 rounded-2xl p-4 flex items-center gap-3 shadow-xl"
              >
                <div className="p-2 bg-white/20 rounded-lg">
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-bold text-white leading-tight">
                    {aiInstruction.en}
                  </p>
                  <p className="text-sm font-bold text-blue-100 leading-tight text-right dir-rtl">
                    {aiInstruction.ar}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Central Arrow */}
        <div className="relative flex flex-col items-center justify-center">
          {/* Glowing Path Effect */}
          <div className="absolute w-80 h-80 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" />
          
          <div className="relative flex flex-col items-center">
            <motion.div
              animate={{ rotate: arrowRotation }}
              className="relative z-10"
            >
              {/* Blinking Pathway Line */}
              <div className="absolute -top-64 left-1/2 -translate-x-1/2 w-10 h-64 pointer-events-none">
                {/* Core Line with Blinking Animation */}
                <motion.div 
                  animate={{ 
                    opacity: [0.2, 1, 0.2],
                    scaleX: [1, 1.5, 1],
                    boxShadow: [
                      "0 0 15px rgba(59,130,246,0.4)",
                      "0 0 40px rgba(59,130,246,1)",
                      "0 0 15px rgba(59,130,246,0.4)"
                    ]
                  }}
                  transition={{ 
                    duration: 1, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2.5 h-full bg-blue-400 rounded-full"
                />
                
                {/* Animated Flow Dots (Blinking Pathway) */}
                <div className="absolute inset-0 flex flex-col items-center justify-around py-4">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        scale: [1, 1.8, 1],
                        opacity: [0.1, 1, 0.1],
                        backgroundColor: ["#3b82f6", "#ffffff", "#3b82f6"]
                      }}
                      transition={{ 
                        duration: 0.8, 
                        repeat: Infinity, 
                        delay: i * 0.1 
                      }}
                      style={{ 
                        width: `${10 - i * 1}px`, 
                        height: `${10 - i * 1}px`,
                      }}
                      className="rounded-full shadow-[0_0_20px_rgba(59,130,246,1)]"
                    />
                  ))}
                </div>
              </div>

              <motion.div 
                className="relative"
                animate={{ 
                  y: [0, -5, 0]
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                {/* Simplified Solid Arrow */}
                <div className="relative bg-blue-600 p-10 rounded-full shadow-2xl border-4 border-white overflow-hidden">
                  <ArrowUp className="w-20 h-20 text-white drop-shadow-lg" />
                </div>

                {/* Directional Indicator */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-xl border-2 border-blue-500" />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="w-full flex justify-between items-end">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-1"
          >
            <Compass className="w-5 h-5 text-blue-400" />
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-tighter">Heading</p>
            <p className="text-lg font-mono font-bold text-white">{Math.round(heading)}°</p>
          </motion.div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex-1 mx-4 bg-blue-600 rounded-2xl p-4 shadow-xl shadow-blue-900/40 flex flex-col items-center"
          >
            <p className="text-xs text-white/70 font-bold uppercase tracking-widest">Distance</p>
            <p className="text-3xl font-black text-white">
              {distanceToNext !== null ? `${displayDistance}m` : "--"}
            </p>
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={`bg-black/40 backdrop-blur-md border rounded-2xl p-4 flex flex-col items-center gap-1 ${isLowAccuracy ? 'border-yellow-500/50' : 'border-white/10'}`}
          >
            <MapPin className={`w-5 h-5 ${userLocation ? (isLowAccuracy ? 'text-yellow-400' : 'text-green-400') : 'text-red-400'}`} />
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-tighter">GPS Accuracy</p>
            <p className={`text-[10px] font-mono font-bold ${isLowAccuracy ? 'text-yellow-400' : 'text-white'}`}>
              {userLocation ? `±${Math.round(userLocation.accuracy)}m` : "Searching GPS..."}
            </p>
            {!userLocation && onRefreshGps && (
              <div className="flex flex-col gap-1 mt-1">
                <button 
                  onClick={onRefreshGps}
                  className="text-[8px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-widest transition-colors"
                >
                  Retry GPS
                </button>
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="text-[8px] bg-white/10 hover:bg-white/20 text-white/70 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest transition-colors border border-white/10"
                >
                  New Tab
                </button>
              </div>
            )}
            {isLowAccuracy && userLocation && (
              <p className="text-[8px] font-bold text-yellow-500/60 animate-pulse">Low Accuracy</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
