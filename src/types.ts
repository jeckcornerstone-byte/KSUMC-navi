export interface Node {
  id: string;
  name: string;
  x: number; // Relative X coordinate (meters or arbitrary units)
  y: number; // Relative Y coordinate (meters or arbitrary units)
  z: number; // Floor level or height
  qrCode?: string; // Associated QR code data for localization
  isAnchor?: boolean; // Whether this node acts as a high-precision anchor
  accuracy?: number; // GPS accuracy in meters
  icon?: 'parking' | 'entrance' | 'building' | 'admin' | 'medical' | 'dental' | 'icu' | 'default';
  color?: string; // Tailwind color class like 'text-blue-500'
}

export interface Edge {
  from: string;
  to: string;
  distance: number;
  pathPoints?: { x: number, y: number }[]; // Recorded points along the real pathway
}

export interface AppSettings {
  appName: string;
  logoUrl?: string;
}

export interface MapData {
  nodes: Node[];
  edges: Edge[];
  settings?: AppSettings;
}

export interface UserPosition {
  currentNodeId: string;
  heading: number; // Degrees from North or relative to map
}
