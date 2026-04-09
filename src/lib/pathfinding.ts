import { MapData, Node, Edge } from '../types';

export function findShortestPath(map: MapData, startNodeId: string, endNodeId: string): string[] {
  const distances: { [key: string]: number } = {};
  const previous: { [key: string]: string | null } = {};
  const nodes = new Set(map.nodes.map(n => n.id));

  map.nodes.forEach(node => {
    distances[node.id] = Infinity;
    previous[node.id] = null;
  });

  distances[startNodeId] = 0;

  while (nodes.size > 0) {
    let closestNodeId: string | null = null;
    nodes.forEach(id => {
      if (closestNodeId === null || distances[id] < distances[closestNodeId]) {
        closestNodeId = id;
      }
    });

    if (!closestNodeId || distances[closestNodeId] === Infinity) break;
    if (closestNodeId === endNodeId) break;

    nodes.delete(closestNodeId);

    const neighbors = map.edges.filter(e => e.from === closestNodeId || e.to === closestNodeId);
    
    for (const edge of neighbors) {
      const neighborId = edge.from === closestNodeId ? edge.to : edge.from;
      if (!nodes.has(neighborId)) continue;

      const neighborNode = map.nodes.find(n => n.id === neighborId);
      const currentNode = map.nodes.find(n => n.id === closestNodeId);
      
      // Use calculated distance if nodes are found, otherwise fallback to edge distance
      const weight = (currentNode && neighborNode) 
        ? calculateDistance(currentNode, neighborNode) 
        : edge.distance;

      const alt = distances[closestNodeId] + weight;
      if (alt < distances[neighborId]) {
        distances[neighborId] = alt;
        previous[neighborId] = closestNodeId;
      }
    }
  }

  const path: string[] = [];
  let current: string | null = endNodeId;
  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  return path[0] === startNodeId ? path : [];
}

export function calculateDistance(n1: Node, n2: Node): number {
  // Check if coordinates look like GPS (Lat/Long)
  const isGPS = (Math.abs(n1.x) > 0.01 && Math.abs(n1.x) <= 90) && 
                (Math.abs(n1.y) > 0.01 && Math.abs(n1.y) <= 180);

  if (isGPS) {
    // Haversine formula to get distance in meters from Lat/Long
    const R = 6371e3; // Earth radius in meters
    const φ1 = n1.x * Math.PI / 180;
    const φ2 = n2.x * Math.PI / 180;
    const Δφ = (n2.x - n1.x) * Math.PI / 180;
    const Δλ = (n2.y - n1.y) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const horizontalDist = R * c;
    const verticalDist = Math.abs(n1.z - n2.z) * 3; // Assume 3m per floor
    return Math.sqrt(Math.pow(horizontalDist, 2) + Math.pow(verticalDist, 2));
  }

  // Default: Euclidean distance for relative meters (X=East, Y=North, Z=Up)
  return Math.sqrt(
    Math.pow(n1.x - n2.x, 2) + 
    Math.pow(n1.y - n2.y, 2) + 
    Math.pow(n1.z - n2.z, 2)
  );
}
