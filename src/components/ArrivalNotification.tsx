import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, PartyPopper, X } from 'lucide-react';

interface ArrivalNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  destinationName: string;
}

export default function ArrivalNotification({ isOpen, onClose, destinationName }: ArrivalNotificationProps) {
  useEffect(() => {
    if (isOpen) {
      // 1. Vibrate (if supported)
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }

      // 2. Play Sound (Web Audio API for reliability)
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playBeep = (freq: number, startTime: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.1, startTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        // Play a "ta-da" sequence
        playBeep(523.25, audioCtx.currentTime, 0.3); // C5
        playBeep(659.25, audioCtx.currentTime + 0.15, 0.3); // E5
        playBeep(783.99, audioCtx.currentTime + 0.3, 0.5); // G5
      } catch (err) {
        console.error("Audio context failed:", err);
      }
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center relative overflow-hidden"
          >
            {/* Background Decoration */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-green-100 rounded-full blur-2xl opacity-50" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-blue-100 rounded-full blur-2xl opacity-50" />

            <div className="relative z-10">
              <div className="mb-6 flex justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                  transition={{ 
                    scale: { delay: 0.2, type: 'spring' },
                    rotate: { delay: 0.2, duration: 0.5, times: [0, 0.3, 0.7, 1] } 
                  }}
                  className="bg-green-100 p-5 rounded-full"
                >
                  <CheckCircle2 className="w-16 h-16 text-green-600" />
                </motion.div>
              </div>

              <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">You've Arrived!</h2>
              <p className="text-gray-500 mb-8">
                You have reached <span className="font-bold text-blue-600">{destinationName}</span>.
              </p>

              <button
                onClick={onClose}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <PartyPopper className="w-5 h-5" /> Awesome!
              </button>
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
