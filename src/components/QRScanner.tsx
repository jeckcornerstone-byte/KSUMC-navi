import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import { WifiOff, AlertCircle, Camera, RefreshCw } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const scannerId = "qr-reader";
    const html5QrCode = new Html5Qrcode(scannerId);
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        setIsInitializing(true);
        setError(null);

        // Configuration for mobile optimization
        const config = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            onScan(decodedText);
            stopScanner();
          },
          (errorMessage) => {
            // Ignore scan failures (no QR code found in frame)
          }
        );
        setIsInitializing(false);
      } catch (err) {
        console.error("Failed to start scanner", err);
        setError(err instanceof Error ? err.message : "Camera access denied or not available.");
        setIsInitializing(false);
      }
    };

    const stopScanner = async () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        try {
          await scannerRef.current.stop();
        } catch (err) {
          console.error("Failed to stop scanner", err);
        }
      }
    };

    startScanner();

    return () => {
      stopScanner();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">Scan Marker</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <XIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Scanner Area */}
        <div className="relative aspect-square bg-black overflow-hidden">
          <div id="qr-reader" className="w-full h-full"></div>
          
          {isInitializing && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/50">
              <RefreshCw className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm font-medium">Starting camera...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-900">
              <div className="bg-red-500/20 p-4 rounded-full mb-4">
                <WifiOff className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-white font-bold mb-2 text-lg">Camera Error</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                {error}. <br/>
                On mobile, ensure you are using <strong>HTTPS</strong> and have granted permissions.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold active:scale-95 transition-all"
              >
                Retry Camera
              </button>
            </div>
          )}

          {/* Scan Overlay UI */}
          {!error && !isInitializing && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 border-[40px] border-black/40"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] border-2 border-blue-500 rounded-2xl shadow-[0_0_0_1000px_rgba(0,0,0,0.4)]">
                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg"></div>
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg"></div>
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg"></div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg"></div>
                
                {/* Scanning Line */}
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-scan"></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-6 bg-gray-50">
          <div className="flex gap-4 items-start bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs text-blue-800 font-bold">Troubleshooting</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                If the camera doesn't load, try <strong>opening in a new tab</strong>. Mobile browsers often block camera access within iFrame previews.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  );
}
