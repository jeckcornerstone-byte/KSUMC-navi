import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Node, MapData } from '../types';
import { calculateDistance, calculateBearing } from '../lib/pathfinding';
import { motion, AnimatePresence, useSpring } from 'motion/react';
import { Navigation, Compass, MapPin, WifiOff, CheckCircle2, Sparkles, BrainCircuit, ExternalLink, AlertCircle } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const AScene = 'a-scene' as any;
const AEntity = 'a-entity' as any;
const ACamera = 'a-camera' as any;
const ACone = 'a-cone' as any;
const ACylinder = 'a-cylinder' as any;
const AText = 'a-text' as any;
const AAssets = 'a-assets' as any;

interface ARViewProps {
  mapData: MapData;
  currentPath: string[];
  currentNodeId: string | null;
  destinationNodeId: string | null;
  userLocation: { x: number, y: number, z: number, accuracy: number } | null;
  isAiTracingEnabled?: boolean;
  networkInfo?: { type: string, effectiveType: string } | null;
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
  networkInfo,
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
  const [isWrongWay, setIsWrongWay] = useState(false);
  const [isNearby, setIsNearby] = useState(false);
  const [activePathPoints, setActivePathPoints] = useState<{ x: number, y: number, bearing: number }[]>([]);
  const [nearbyAnchor, setNearbyAnchor] = useState<Node | null>(null);
  const [aiInstruction, setAiInstruction] = useState<{ en: string, ar: string, bearingOffset?: number } | null>(null);
  const [aiBearingOffset, setAiBearingOffset] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isExtenderActive, setIsExtenderActive] = useState(false);
  const [extenderConfidence, setExtenderConfidence] = useState(100);
  const wakeLock = useRef<any>(null);
  const userLocationRef = useRef(userLocation);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Screen Wake Lock to prevent iPhone from sleeping during navigation
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock.current = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock is active');
        } catch (err) {
          console.error(`${err.name}, ${err.message}`);
        }
      }
    };

    if (isPermissionGranted) {
      requestWakeLock();
    }

    const handleVisibilityChange = async () => {
      if (wakeLock.current !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock.current) {
        wakeLock.current.release();
        wakeLock.current = null;
      }
    };
  }, [isPermissionGranted]);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }), []);
  
  // Use refs for AI analysis to prevent interval resets on every location update
  const aiStateRef = useRef({
    currentNodeId,
    destinationNodeId,
    nodes: mapData.nodes,
    isAnalyzing: false
  });

  useEffect(() => {
    aiStateRef.current = {
      currentNodeId,
      destinationNodeId,
      nodes: mapData.nodes,
      isAnalyzing: aiStateRef.current.isAnalyzing
    };
  }, [currentNodeId, destinationNodeId, mapData.nodes]);

  const captureFrame = () => {
    // Try to find AR.js video element first, then fallback to videoRef
    const arjsVideo = document.querySelector('.arjs-video') as HTMLVideoElement;
    const video = arjsVideo || videoRef.current;
    
    if (!video || video.readyState < 2) return null;
    
    // Resize for speed: 640px max dimension is plenty for Gemini to see landmarks
    const maxDim = 640;
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (width > height) {
      if (width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      }
    } else {
      if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // Slightly higher compression for speed
  };

  // AI Visual Guidance Logic
  const analyzeEnvironment = async () => {
    if (aiStateRef.current.isAnalyzing || !isAiTracingEnabled || hasTriggeredArrival || !isPermissionGranted) return;
    const frame = captureFrame();
    if (!frame) return;

    aiStateRef.current.isAnalyzing = true;
    setIsAnalyzing(true);
    try {
      const { currentNodeId: currId, destinationNodeId: destId, nodes } = aiStateRef.current;
      if (!destId) return;

      const destNode = nodes.find(n => n.id === destId);
      const currNode = nodes.find(n => n.id === currId);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: frame, mimeType: "image/jpeg" } },
            { text: `You are an indoor navigation assistant at KSUMC hospital. 
              The user is currently at or near "${currNode?.name || 'Unknown'}" and heading to "${destNode?.name || 'Destination'}".
              Based on this camera view of their surroundings, provide a short, clear, and helpful navigation instruction in both English and Arabic.
              Also, provide a "bearingOffset" which is a number from -180 to 180 indicating where the user should turn based on visual cues (0 is straight, -90 is left, 90 is right).
              IMPORTANT: If you see a clear path or a sign pointing to the destination, use the bearingOffset to ALIGN the user with that path.
              If you see specific hospital signs, doors, or landmarks in the image, use them to guide the user.
              Keep it concise and direct (max 8 words per language).
              Return the result as a JSON object with "en", "ar", and "bearingOffset" keys.` }
          ]
        },
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const responseText = response.text;
      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.en && parsed.ar) {
            setAiInstruction(parsed);
            if (typeof parsed.bearingOffset === 'number') {
              setAiBearingOffset(parsed.bearingOffset);
            }
          }
        } catch (e) {
          console.error("Failed to parse AI response", e);
        }
      }
    } catch (e) {
      console.error("AI Visual Guidance Error:", e);
    } finally {
      aiStateRef.current.isAnalyzing = false;
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!isAiTracingEnabled || !destinationNodeId || hasTriggeredArrival || !isPermissionGranted) {
      setAiInstruction(null);
      return;
    }

    const interval = setInterval(analyzeEnvironment, 4000); // Slightly slower interval for stability
    analyzeEnvironment(); // Run once immediately

    return () => clearInterval(interval);
  }, [isAiTracingEnabled, hasTriggeredArrival, isPermissionGranted, ai]);

  // Trigger immediate analysis when location or destination changes
  useEffect(() => {
    if (isAiTracingEnabled && destinationNodeId && !hasTriggeredArrival) {
      analyzeEnvironment();
    }
  }, [currentNodeId, destinationNodeId]);

  useEffect(() => {
    const points: { x: number, y: number, bearing: number }[] = [];
    for (let i = 0; i < currentPath.length - 1; i++) {
      const fromId = currentPath[i];
      const toId = currentPath[i+1];
      const fromNode = mapData.nodes.find(n => n.id === fromId);
      const toNode = mapData.nodes.find(n => n.id === toId);
      
      const edge = mapData.edges.find(e => 
        (e.from === fromId && e.to === toId) ||
        (e.from === toId && e.to === fromId)
      );

      if (edge?.pathPoints && edge.pathPoints.length > 0) {
        // Use recorded points if available
        for (let k = 0; k < edge.pathPoints.length; k++) {
          const p1 = edge.pathPoints[k];
          const p2 = edge.pathPoints[k+1] || toNode || p1;
          points.push({
            x: p1.x,
            y: p1.y,
            bearing: calculateBearing({x: p1.x, y: p1.y, z: 0, id: 'tmp'} as Node, {x: p2.x, y: p2.y, z: 0, id: 'tmp'} as Node)
          });
        }
      } else if (fromNode && toNode) {
        // Generate synthetic points every 2 meters for smooth guidance
        const dist = calculateDistance(fromNode, toNode);
        const steps = Math.max(1, Math.floor(dist / 2));
        const bearing = calculateBearing(fromNode, toNode);
        for (let j = 1; j <= steps; j++) {
          const ratio = j / (steps + 1);
          points.push({
            x: fromNode.x + (toNode.x - fromNode.x) * ratio,
            y: fromNode.y + (toNode.y - fromNode.y) * ratio,
            bearing
          });
        }
      }
    }
    setActivePathPoints(points);
  }, [currentPath, mapData]);

  // Smoothing for heading, location, and distance
  const smoothHeading = useSpring(0, { stiffness: 80, damping: 50 });
  const smoothLat = useSpring(userLocation?.x || 0, { stiffness: 100, damping: 60 });
  const smoothLng = useSpring(userLocation?.y || 0, { stiffness: 100, damping: 60 });
  const smoothDistance = useSpring(0, { stiffness: 80, damping: 45 });
  const smoothBearing = useSpring(0, { stiffness: 80, damping: 45 });

  const isFirstHeading = useRef(true);
  const isFirstPos = useRef(true);
  const isFirstBearing = useRef(true);
  const lastSnappedAnchorId = useRef<string | null>(null);
  const lastStablePos = useRef<Node | null>(null);

  // Accuracy-weighted position filtering
  const [filteredPos, setFilteredPos] = useState<{ x: number, y: number, z: number } | null>(null);

  // Reset arrival trigger when current node or destination changes
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
  }, [currentNodeId, destinationNodeId, mapData.nodes, smoothLat, smoothLng]);

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
    let currentStream: MediaStream | null = null;
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
        currentStream = stream;
        videoRef.current.srcObject = stream;
        setCameraError(null);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setCameraError(err instanceof Error ? err.message : "Could not access camera.");
      }
    }
    setupCamera();
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
      }
      // Also clean up any AR.js injected video elements
      const arjsVideos = document.querySelectorAll('.arjs-video');
      arjsVideos.forEach(v => {
        if (v instanceof HTMLVideoElement && v.srcObject) {
          (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
          v.remove();
        }
      });
    };
  }, []);

  // Device Orientation setup
  useEffect(() => {
    let lastHeading = 0;
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let h: number | null = null;

      // 1. Try iOS absolute heading (webkitCompassHeading)
      if ((e as any).webkitCompassHeading !== undefined) {
        h = (e as any).webkitCompassHeading;
      } 
      // 2. Try Android absolute heading
      else if (e.absolute && e.alpha !== null) {
        h = 360 - e.alpha;
      }
      // 3. Fallback to alpha if available
      else if (e.alpha !== null) {
        h = 360 - e.alpha;
      }

      if (h !== null) {
        // Normalize heading to 0-360
        h = ((h % 360) + 360) % 360;

        // SENSOR FUSION: Complementary Filter
        // Combine absolute compass (h) with integrated gyro (fusedHeading.current)
        // Alpha (0.98) gives 98% weight to gyro in short term, 2% to compass to correct drift
        const alpha = 0.98;
        
        // Handle wrap-around for the filter
        let diff = h - fusedHeading.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        fusedHeading.current = (fusedHeading.current + (1 - alpha) * diff + 360) % 360;
        const finalH = fusedHeading.current;

        if (isFirstHeading.current) {
          smoothHeading.jump(finalH);
          isFirstHeading.current = false;
        }

        // Handle 0/360 jump for smooth rotation
        let currentS = smoothHeading.get();
        let sDiff = finalH - currentS;
        
        // Shortest path rotation logic
        let adjustedH = finalH;
        if (sDiff > 180) adjustedH -= 360;
        else if (sDiff < -180) adjustedH += 360;
        
        setHeading(adjustedH);
        smoothHeading.set(adjustedH);
      }
    };

    const handleCompassNeedsCalibration = (e: Event) => {
      e.preventDefault();
      setLocalMessage("Please move your phone in a figure-8 motion to calibrate the compass.");
      setTimeout(() => setLocalMessage(null), 5000);
    };

    const handleOrientationWrapper = (e: any) => handleOrientation(e);

    if (isPermissionGranted) {
      window.addEventListener('deviceorientation', handleOrientationWrapper, true);
      window.addEventListener('compassneedscalibration', handleCompassNeedsCalibration as any, true);
      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientationWrapper, true);
      }
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientationWrapper);
      window.removeEventListener('compassneedscalibration', handleCompassNeedsCalibration as any);
      if ('ondeviceorientationabsolute' in window) {
        window.removeEventListener('deviceorientationabsolute', handleOrientationWrapper);
      }
    };
  }, [isPermissionGranted]);

  const requestPermissions = async () => {
    // Request Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      console.error("Camera permission denied", e);
      setCameraError("Camera access denied. Please enable it in settings.");
    }

    // Request Orientation (iOS 13+)
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
  const lastStepTime = useRef<number>(0);
  const stepCount = useRef<number>(0);
  const lastGyroTime = useRef<number>(0);
  const fusedHeading = useRef<number>(0);
  const fusedPosition = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const handleMotion = (e: DeviceMotionEvent) => {
      const now = performance.now();
      
      // 1. Step Detection for Dead Reckoning
      if (e.accelerationIncludingGravity) {
        const { x, y, z } = e.accelerationIncludingGravity;
        if (x !== null && y !== null && z !== null) {
          if (lastAccel.current) {
            const delta = Math.sqrt(
              Math.pow(x - lastAccel.current.x, 2) +
              Math.pow(y - lastAccel.current.y, 2) +
              Math.pow(z - lastAccel.current.z, 2)
            );
            
            setIsMoving(delta > 0.8);

            // Simple peak detection for steps
            const accelMag = Math.sqrt(x*x + y*y + z*z);
            if (accelMag > 12.5 && now - lastStepTime.current > 350) { // Threshold for a step
              lastStepTime.current = now;
              stepCount.current++;
              
              // Dead Reckoning: Update fused position based on step
              if (fusedPosition.current) {
                const stepLengthMeters = 0.75; // Average step length
                // Convert meters to degrees (approximate)
                const stepLengthDeg = stepLengthMeters / 111320; 
                
                const currentH = smoothHeading.get();
                const rad = (90 - currentH) * Math.PI / 180;
                
                fusedPosition.current.x += stepLengthDeg * Math.cos(rad);
                fusedPosition.current.y += stepLengthDeg * Math.sin(rad);

                // If GPS is weak, we are relying on the "Extender"
                const currentLoc = userLocationRef.current;
                if (currentLoc && currentLoc.accuracy > 15) {
                  setIsExtenderActive(true);
                  setExtenderConfidence(prev => Math.max(30, prev - 0.5));
                } else {
                  setIsExtenderActive(false);
                  setExtenderConfidence(100);
                }
              }
            }
          }
          lastAccel.current = { x, y, z };
        }
      }

      // 2. Gyroscope integration for Heading Fusion
      if (e.rotationRate && e.rotationRate.alpha !== null) {
        const dt = lastGyroTime.current ? (now - lastGyroTime.current) / 1000 : 0;
        lastGyroTime.current = now;
        
        // rotationRate.alpha is rotation around Z axis (heading)
        // Note: rotationRate units can vary, but usually deg/s
        const gyroChange = e.rotationRate.alpha * dt;
        fusedHeading.current = (fusedHeading.current - gyroChange + 360) % 360;
      }
    };

    window.addEventListener('devicemotion', handleMotion, true);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, []);

  // Update smoothing springs when userLocation prop changes
  useEffect(() => {
    if (userLocation) {
      // SENSOR FUSION: Blend GPS with Dead Reckoning
      if (!fusedPosition.current) {
        fusedPosition.current = { x: userLocation.x, y: userLocation.y };
      } else {
        // SENSOR FUSION: Blend GPS with Dead Reckoning
        // Blend factor based on GPS accuracy
        // High accuracy (low meters) -> trust GPS more
        const gpsWeight = Math.max(0.1, Math.min(0.8, 5 / userLocation.accuracy));

        fusedPosition.current.x = fusedPosition.current.x * (1 - gpsWeight) + userLocation.x * gpsWeight;
        fusedPosition.current.y = fusedPosition.current.y * (1 - gpsWeight) + userLocation.y * gpsWeight;
      }

      // 1. Path Snapping Logic
      let targetX = fusedPosition.current.x;
      let targetY = fusedPosition.current.y;
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
          // Position Deadzone: Only update the "from" position if the user has moved > 1.2m 
          // or is actively moving (detected by accelerometer). This prevents arrow jitter when standing still.
          const currentPos = { x: filteredPos.x, y: filteredPos.y, z: filteredPos.z } as Node;
          
          if (!lastStablePos.current || calculateDistance(lastStablePos.current, currentPos) > 1.2 || isMoving) {
            lastStablePos.current = { ...currentNode, ...currentPos } as Node;
          }
          
          fromPos = lastStablePos.current;
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

        // Apply AI Hybrid Guidance: Nudge the bearing based on visual detection
        // We apply a balanced portion of the AI offset to keep it "direct to coordinate"
        // but visually responsive to landmarks.
        if (isAiTracingEnabled && aiBearingOffset !== 0) {
          // Blend 50% of AI suggestion with 50% GPS bearing
          // This makes the arrow "follow" the smart view detection very closely
          // while staying locked to the destination.
          bearing = (bearing + (aiBearingOffset * 0.5) + 360) % 360;
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
        
        // Apply manual smoothing factor when close to target to "lock" the arrow
        const distToTarget = calculateDistance(fromPos, finalTargetNode);
        let smoothingFactor = distToTarget < 20 ? 0.15 : 1.0;
        
        // If AI is confident we are going straight, increase stability further
        if (isAiTracingEnabled && Math.abs(aiBearingOffset) < 15) {
          smoothingFactor *= 0.5;
        }
        
        const finalBearing = lastB + (bearing - lastB) * smoothingFactor;
        
        smoothBearing.set(finalBearing);

        // Update nearby state (within 20m as requested)
        setIsNearby(dist < 20);

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
      
      // If the arrow is pointing behind the user (> 110 degrees away), it's the wrong way
      setIsWrongWay(Math.abs(diff) > 110);
      
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
    <div className="relative w-full h-[100dvh] overflow-hidden bg-black" style={{ touchAction: 'none' }}>
      {/* A-Frame Scene for 3D AR Guidance */}
      {isPermissionGranted && (
        <div className="absolute inset-0 z-0">
          <AScene
            embedded
            arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
            vr-mode-ui="enabled: false"
            renderer="antialias: true; alpha: true"
          >
            <AAssets>
              {/* We can add 3D models here if needed */}
            </AAssets>

            {/* Wrong Way Warning */}
            {isWrongWay && !hasTriggeredArrival && (
              <AEntity position="0 1.5 -2">
                <AText
                  value="WRONG WAY"
                  align="center"
                  color="#ef4444"
                  width="5"
                  font="exo2bold"
                  animation="property: opacity; from: 1; to: 0.2; dir: alternate; dur: 400; loop: true"
                ></AText>
                <AEntity
                  light="type: point; color: #ef4444; intensity: 2; distance: 4"
                  position="0 0 0"
                ></AEntity>
              </AEntity>
            )}

            {/* 3D Destination Marker (Visible when close) */}
            {hasTriggeredArrival && (
              <AEntity position="0 0 -5">
                <ACylinder 
                  color="#22c55e" 
                  height="0.1" 
                  radius="2" 
                  opacity="0.5"
                  animation="property: scale; to: 1.2 1.2 1.2; dir: alternate; dur: 1000; loop: true"
                ></ACylinder>
                <AEntity
                  geometry="primitive: torus; radius: 1; radius-tubular: 0.05"
                  material="color: #22c55e; emissive: #22c55e; emissiveIntensity: 2"
                  rotation="90 0 0"
                  position="0 1 0"
                  animation="property: rotation; to: 90 360 0; dur: 4000; easing: linear; loop: true"
                ></AEntity>
                <AText
                  value="YOU HAVE ARRIVED"
                  align="center"
                  position="0 2.5 0"
                  color="#ffffff"
                  width="6"
                  font="exo2bold"
                ></AText>
              </AEntity>
            )}

            {/* Glowing Red Location Icon (Visible when 20m nearby) */}
            {isNearby && !hasTriggeredArrival && destinationNodeId && (() => {
              const destNode = mapData.nodes.find(n => n.id === destinationNodeId);
              if (!destNode) return null;
              return (
                <AEntity gps-entity-place={`latitude: ${destNode.x}; longitude: ${destNode.y};`}>
                  <AEntity position="0 0 0">
                    {/* Pin Head */}
                    <AEntity
                      geometry="primitive: sphere; radius: 0.4"
                      material="color: #ef4444; emissive: #ef4444; emissiveIntensity: 2"
                      position="0 2 0"
                      animation="property: position; to: 0 2.3 0; dir: alternate; dur: 1000; loop: true; easing: easeInOutSine"
                    ></AEntity>
                    {/* Pin Body (Cone) */}
                    <AEntity
                      geometry="primitive: cone; radiusBottom: 0.4; radiusTop: 0.01; height: 1.2"
                      material="color: #ef4444; emissive: #ef4444; emissiveIntensity: 1"
                      position="0 1.2 0"
                      rotation="180 0 0"
                      animation="property: position; to: 0 1.5 0; dir: alternate; dur: 1000; loop: true; easing: easeInOutSine"
                    ></AEntity>
                    {/* Ground Glow */}
                    <AEntity
                      geometry="primitive: cylinder; radius: 1.5; height: 0.05"
                      material="color: #ef4444; opacity: 0.3; transparent: true"
                      position="0 -1.5 0"
                      animation="property: scale; to: 1.2 1 1.2; dir: alternate; dur: 1000; loop: true"
                    ></AEntity>
                    {/* Proximity Text */}
                    <AText
                      value="DESTINATION NEARBY"
                      align="center"
                      position="0 3.2 0"
                      color="#ef4444"
                      width="5"
                      font="exo2bold"
                      look-at="[gps-camera]"
                    ></AText>
                    {/* Point Light for Glow */}
                    <AEntity
                      light="type: point; color: #ef4444; intensity: 3; distance: 10"
                      position="0 2 0"
                    ></AEntity>
                  </AEntity>
                </AEntity>
              );
            })()}

            {/* Google Maps Style 3D Arrow Path (Every 2m) */}
            {activePathPoints.map((point, idx) => (
              <AEntity
                key={`path-point-${idx}`}
                gps-entity-place={`latitude: ${point.x}; longitude: ${point.y};`}
              >
                {/* 3D Navigation Arrow on Ground */}
                <AEntity
                  rotation={`0 ${point.bearing} 0`}
                  position="0 -1.4 0"
                  scale="2.2 2.2 2.2"
                >
                  {/* Arrow Body */}
                  <AEntity
                    geometry="primitive: box; width: 0.4; height: 0.02; depth: 0.8"
                    material="color: #3b82f6; emissive: #3b82f6; emissiveIntensity: 1; opacity: 0.7; transparent: true"
                    position="0 0 0"
                  />
                  {/* Arrow Head */}
                  <AEntity
                    geometry="primitive: cone; radiusBottom: 0.4; radiusTop: 0.01; height: 0.5"
                    material="color: #3b82f6; emissive: #3b82f6; emissiveIntensity: 2; opacity: 0.8; transparent: true"
                    position="0 0 -0.55"
                    rotation="90 0 0"
                  />
                  {/* Ground Glow for the Arrow */}
                  <AEntity
                    geometry="primitive: circle; radius: 0.8"
                    material="color: #3b82f6; opacity: 0.1; transparent: true"
                    rotation="-90 0 0"
                    position="0 -0.01 0"
                  />
                </AEntity>
              </AEntity>
            ))}

            <ACamera gps-camera="simulateAltitude: false; minDistance: 1; maxDistance: 100;" rotation-reader></ACamera>
          </AScene>
        </div>
      )}

      {/* Unified Permission Request Overlay */}
      <AnimatePresence>
        {isPermissionGranted === null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[120] bg-gray-900 flex items-center justify-center p-8 text-center"
          >
            <div className="max-w-xs w-full">
              <div className="w-24 h-24 bg-blue-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-500/20">
                <Compass className="w-12 h-12 text-white animate-pulse" />
              </div>
              <h2 className="text-3xl font-black text-white mb-4 tracking-tighter">Sensors Required</h2>
              <p className="text-gray-400 text-sm mb-10 leading-relaxed font-medium">
                To provide high-precision navigation, we need access to your <strong>Camera</strong> and <strong>Compass</strong>.
              </p>
              
              <div className="space-y-4">
                <button 
                  onClick={requestPermissions}
                  className="w-full bg-blue-600 text-white font-black py-6 rounded-3xl shadow-[0_20px_40px_rgba(37,99,235,0.3)] hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
                >
                  <Navigation className="w-6 h-6 rotate-45" /> Allow Access
                </button>
                <div className="pt-4">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-2">
                    iPhone users
                  </p>
                  <p className="text-xs text-gray-600 font-bold">
                    You must tap "Allow" on the system prompt to enable the compass.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permission Denied State */}
      <AnimatePresence>
        {isPermissionGranted === false && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[130] bg-gray-900 flex items-center justify-center p-8 text-center"
          >
            <div className="max-w-xs">
              <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-2xl font-black text-white mb-4">Permission Denied</h2>
              <p className="text-gray-400 text-sm mb-8">
                Sensors are required for AR navigation. Please refresh the page and allow access, or check your browser settings.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-white text-black font-black py-4 rounded-2xl"
              >
                Refresh Page
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
      <div className="absolute inset-0 flex flex-col items-center justify-between p-4 sm:p-8 pointer-events-none">
        
        {/* Top Info */}
        <div className="w-full max-w-md flex flex-col gap-3">
          {/* 2D Navigation Arrow (Google Maps Style) */}
          {!hasTriggeredArrival && (
            <motion.div
              style={{ rotate: arrowRotation }}
              className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-1 sm:mb-2 relative flex items-center justify-center"
            >
              {/* Outer Ring */}
              <div className="absolute inset-0 rounded-full border-4 border-white/20 backdrop-blur-sm" />
              {/* Inner Glow */}
              <div className="absolute inset-2 rounded-full bg-blue-600/10 animate-pulse" />
              {/* The Arrow */}
              <svg viewBox="0 0 24 24" className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">
                <path 
                  fill="currentColor" 
                  d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" 
                />
              </svg>
            </motion.div>
          )}

          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-2xl"
          >
            <div className="p-2 sm:p-3 bg-blue-600 rounded-xl sm:rounded-2xl shadow-lg shadow-blue-500/40 shrink-0">
              <Navigation className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[9px] sm:text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mb-0.5">Heading To</p>
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
                      <BrainCircuit className={`w-2 h-2 ${isAnalyzing ? "animate-spin" : "animate-pulse"}`} /> 
                      {isAnalyzing ? "Analyzing..." : "AI Tracing"}
                    </motion.span>
                  )}
                  {isExtenderActive && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-orange-500 text-[8px] text-white font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-1"
                    >
                      <Sparkles className="w-2 h-2 animate-pulse" />
                      Extender Active
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-lg sm:text-xl font-black text-white truncate leading-tight">
                {mapData.nodes.find(n => n.id === destinationNodeId)?.name || "Destination"}
              </p>
            </div>
          </motion.div>

          {/* AI Visual Instruction Overlay */}
          <AnimatePresence mode="wait">
            {localMessage && (
              <motion.div
                key="local-msg"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-4 flex items-center gap-3 shadow-lg"
              >
                <div className="p-2 bg-blue-600 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white leading-tight">
                  {localMessage}
                </p>
              </motion.div>
            )}
            {aiInstruction && isAiTracingEnabled && (
              <motion.div
                key={aiInstruction.en}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.5, ease: "backOut" }}
                className="w-full bg-blue-600/95 backdrop-blur-2xl border border-blue-400/50 rounded-3xl p-6 flex flex-col gap-4 shadow-2xl shadow-blue-900/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full">
                    <BrainCircuit className="w-4 h-4 text-white animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Smart View Detection</span>
                  </div>
                  {isAnalyzing && (
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-lg font-black text-white leading-tight tracking-tight">
                    {aiInstruction.en}
                  </p>
                  <div className="h-px bg-white/20 w-full" />
                  <p className="text-lg font-black text-white leading-tight text-right dir-rtl font-arabic">
                    {aiInstruction.ar}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Controls & Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col gap-4 pointer-events-none">
          <div className="flex justify-between items-end pointer-events-auto">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-1"
          >
            <Compass className="w-5 h-5 text-blue-400" />
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-tighter">Heading</p>
            <p className="text-lg font-mono font-bold text-white">{Math.round(((heading % 360) + 360) % 360)}°</p>
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

        {/* Signal Anchor Status */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="self-start bg-black/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-3 pointer-events-auto"
        >
          <div className="flex gap-0.5 items-end h-3">
            <div className={`w-1 h-1 rounded-full ${networkInfo ? 'bg-blue-400' : 'bg-gray-500'}`} />
            <div className={`w-1 h-2 rounded-full ${networkInfo?.effectiveType === '3g' || networkInfo?.effectiveType === '4g' || networkInfo?.effectiveType === '5g' ? 'bg-blue-400' : 'bg-gray-500'}`} />
            <div className={`w-1 h-3 rounded-full ${networkInfo?.effectiveType === '4g' || networkInfo?.effectiveType === '5g' ? 'bg-blue-400' : 'bg-gray-500'}`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-white/60 uppercase tracking-widest leading-none mb-1">Signal Anchor</span>
            <span className="text-[10px] font-bold text-white leading-none">
              {networkInfo ? `${networkInfo.effectiveType.toUpperCase()} Active` : 'Searching...'}
            </span>
          </div>
        </motion.div>
      </div>
      </div>
    </div>
  );
}
