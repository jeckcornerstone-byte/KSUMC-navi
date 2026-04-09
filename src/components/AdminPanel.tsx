import React, { useState } from 'react';
import { MapData, Node, Edge } from '../types';
import { Plus, Trash2, Save, X, Map as MapIcon, Link as LinkIcon, QrCode, LocateFixed, HelpCircle, Bell, RotateCcw, MapPin, Compass, Copy, Check, FileJson } from 'lucide-react';

interface AdminPanelProps {
  mapData: MapData;
  onSave: (data: MapData) => void;
  onClose: () => void;
  onTestArrival?: () => void;
  onReset?: () => void;
  onSetCurrentNode?: (nodeId: string) => void;
}

export default function AdminPanel({ mapData, onSave, onClose, onTestArrival, onReset, onSetCurrentNode }: AdminPanelProps) {
  const [localData, setLocalData] = useState<MapData>(mapData);
  const [activeTab, setActiveTab] = useState<'nodes' | 'edges'>('nodes');
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyMapCode = () => {
    const code = `const DEFAULT_MAP: MapData = ${JSON.stringify(localData, null, 2)};`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const importMapCode = () => {
    const input = prompt("Paste the Map Data JSON here:");
    if (!input) return;
    try {
      // Handle both raw JSON and the "const DEFAULT_MAP = ..." format
      let jsonStr = input.trim();
      if (jsonStr.startsWith('const')) {
        jsonStr = jsonStr.substring(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1);
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed.nodes && parsed.edges) {
        setLocalData(parsed);
        alert("Map data imported successfully! Don't forget to save.");
      } else {
        alert("Invalid map data format.");
      }
    } catch (e) {
      alert("Error parsing map data. Please ensure it's valid JSON.");
    }
  };

  const captureGPS = (nodeId: string) => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    // Use high accuracy and a timeout for better results
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition((position) => {
      updateNode(nodeId, {
        x: position.coords.latitude,
        y: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      // Show accuracy to the user
      console.log(`Captured GPS with accuracy: ${position.coords.accuracy}m`);
    }, (err) => {
      alert("Error capturing GPS: " + err.message);
    }, options);
  };

  const addNode = () => {
    const newNode: Node = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `New Location ${localData.nodes.length + 1}`,
      x: 0,
      y: 0,
      z: 0,
      qrCode: `naviar-${localData.nodes.length + 1}`
    };
    setLocalData({ ...localData, nodes: [...localData.nodes, newNode] });
  };

  const removeNode = (id: string) => {
    setLocalData({
      nodes: localData.nodes.filter(n => n.id !== id),
      edges: localData.edges.filter(e => e.from !== id && e.to !== id)
    });
  };

  const updateNode = (id: string, updates: Partial<Node>) => {
    setLocalData({
      ...localData,
      nodes: localData.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
    });
  };

  const addEdge = () => {
    if (localData.nodes.length < 2) return;
    const newEdge: Edge = {
      from: localData.nodes[0].id,
      to: localData.nodes[1].id,
      distance: 5
    };
    setLocalData({ ...localData, edges: [...localData.edges, newEdge] });
  };

  const removeEdge = (index: number) => {
    const newEdges = [...localData.edges];
    newEdges.splice(index, 1);
    setLocalData({ ...localData, edges: newEdges });
  };

  const updateEdge = (index: number, updates: Partial<Edge>) => {
    const newEdges = [...localData.edges];
    newEdges[index] = { ...newEdges[index], ...updates };
    setLocalData({ ...localData, edges: newEdges });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <MapIcon className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Map Editor</h1>
        </div>
        <div className="flex gap-2">
          {onReset && (
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if (confirm("This will clear all your custom changes and reset to the map defined in the code. Continue?")) {
                    onReset();
                  }
                }}
                className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold transition-colors"
                title="Reset to Code Defaults"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <button 
                onClick={() => {
                  if (confirm("This will clear your current location and all saved data. The app will reload. Continue?")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold transition-colors"
                title="Clear All App Data"
              >
                <Trash2 className="w-4 h-4" /> Clear Cache
              </button>
            </div>
          )}
          <button 
            onClick={onTestArrival}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold transition-colors"
            title="Test Arrival Notification"
          >
            <Bell className="w-4 h-4" /> Test
          </button>
          <button 
            onClick={copyMapCode}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
              copied ? 'bg-green-100 text-green-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
            title="Copy Map Data as Code"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Code"}
          </button>
          <button 
            onClick={importMapCode}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold transition-colors"
            title="Import Map Data from JSON"
          >
            <FileJson className="w-4 h-4" /> Import
          </button>
          <button 
            onClick={() => onSave(localData)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
          >
            <Save className="w-4 h-4" /> Save Changes
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b px-6 justify-between items-center">
        <div className="flex">
          <button 
            onClick={() => setActiveTab('nodes')}
            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'nodes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
          >
            Locations ({localData.nodes.length})
          </button>
          <button 
            onClick={() => setActiveTab('edges')}
            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'edges' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
          >
            Connections ({localData.edges.length})
          </button>
        </div>
        <button 
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-1 text-xs font-bold text-blue-500 hover:text-blue-600"
        >
          <HelpCircle className="w-4 h-4" /> Coordinate Guide
        </button>
      </div>

      {/* Guide Panel */}
      {showGuide && (
        <div className="bg-blue-50 p-4 border-b border-blue-100 mx-6 mt-4 rounded-xl">
          <h3 className="font-bold text-blue-900 mb-2">How to set exact locations:</h3>
          <ul className="text-xs text-blue-800 space-y-2 list-disc pl-4">
            <li><strong>Option A (Indoor Meters):</strong> Pick a corner as (0,0). Measure distance in meters. <strong>X is East (+X) / West (-X)</strong>, <strong>Y is North (+Y) / South (-Y)</strong>.</li>
            <li><strong>Option B (GPS):</strong> Use Latitude for X and Longitude for Y (e.g., 24.712). The app will automatically convert these to meters for navigation.</li>
            <li><strong>Tip:</strong> Use the "Capture GPS" button while standing at a location to save its coordinates instantly.</li>
          </ul>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'nodes' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {localData.nodes.map(node => (
              <div key={node.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <input 
                    value={node.name}
                    onChange={(e) => updateNode(node.id, { name: e.target.value })}
                    className="font-bold text-gray-900 bg-transparent border-b border-transparent focus:border-blue-500 outline-none"
                  />
                  <button onClick={() => removeNode(node.id)} className="p-1 text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold text-gray-400">X (Lat / East)</label>
                      <input 
                        type="number" 
                        value={node.x}
                        onChange={(e) => updateNode(node.id, { x: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-50 border rounded p-1 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Y (Long / North)</label>
                      <input 
                        type="number" 
                        value={node.y}
                        onChange={(e) => updateNode(node.id, { y: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-50 border rounded p-1 text-sm"
                      />
                    </div>
                    <button 
                      onClick={() => captureGPS(node.id)}
                      className="mt-4 p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
                      title="Capture Current GPS"
                    >
                      <LocateFixed className="w-4 h-4" />
                      {node.accuracy && <span className="text-[8px] font-bold">±{Math.round(node.accuracy)}m</span>}
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400">QR Code Data</label>
                    <div className="flex items-center gap-2 bg-gray-50 border rounded p-1">
                      <QrCode className="w-3 h-3 text-gray-400" />
                      <input 
                        value={node.qrCode || ''}
                        onChange={(e) => updateNode(node.id, { qrCode: e.target.value })}
                        className="flex-1 bg-transparent text-sm outline-none"
                        placeholder="Scan data..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id={`anchor-${node.id}`}
                      checked={!!node.isAnchor}
                      onChange={(e) => updateNode(node.id, { isAnchor: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`anchor-${node.id}`} className="text-xs font-bold text-gray-600 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-blue-500" /> High-precision Anchor
                    </label>
                  </div>
                  {onSetCurrentNode && (
                    <button 
                      onClick={() => onSetCurrentNode(node.id)}
                      className="w-full mt-2 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <MapPin className="w-3 h-3" /> Set as Current Location
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button 
              onClick={addNode}
              className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-all"
            >
              <Plus className="w-8 h-8" />
              <span className="font-bold text-sm">Add Location</span>
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {localData.edges.map((edge, idx) => (
              <div key={`${edge.from}-${edge.to}-${idx}`} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center gap-4 shadow-sm">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold text-gray-400">From</label>
                  <select 
                    value={edge.from}
                    onChange={(e) => updateEdge(idx, { from: e.target.value })}
                    className="w-full bg-gray-50 border rounded p-2 text-sm"
                  >
                    {localData.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
                <LinkIcon className="w-4 h-4 text-gray-300 mt-4" />
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold text-gray-400">To</label>
                  <select 
                    value={edge.to}
                    onChange={(e) => updateEdge(idx, { to: e.target.value })}
                    className="w-full bg-gray-50 border rounded p-2 text-sm"
                  >
                    {localData.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className="text-[10px] uppercase font-bold text-gray-400">Dist (m)</label>
                  <input 
                    type="number"
                    value={edge.distance}
                    onChange={(e) => updateEdge(idx, { distance: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-gray-50 border rounded p-2 text-sm"
                  />
                </div>
                <button onClick={() => removeEdge(idx)} className="p-2 text-red-400 hover:text-red-600 mt-4">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            <button 
              onClick={addEdge}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 flex items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-all"
            >
              <Plus className="w-6 h-6" />
              <span className="font-bold text-sm">Add Connection</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
