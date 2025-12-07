"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";

export type EmbeddingPoint = {
  id: string;
  position: [number, number, number];
  label?: string;
};

export type EmbeddingSceneProps = {
  points: EmbeddingPoint[];
  pointSize?: number;
  backgroundColor?: string;
  defaultPointColor?: string;
  highlightColor?: string;
};

type Bounds = {
  center: [number, number, number];
  radius: number;
};

function computeBounds(points: EmbeddingPoint[]): Bounds {
  if (!points.length) {
    return {
      center: [0, 0, 0],
      radius: 1,
    };
  }

  let minX = points[0].position[0];
  let minY = points[0].position[1];
  let minZ = points[0].position[2];
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;

  for (let index = 1; index < points.length; index += 1) {
    const [x, y, z] = points[index].position;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const extentZ = maxZ - minZ;

  const radius = Math.max(extentX, extentY, extentZ) || 1;

  return {
    center: [centerX, centerY, centerZ],
    radius,
  };
}

type EmbeddingPointMeshProps = {
  point: EmbeddingPoint;
  size: number;
  color: string;
  highlightColor: string;
  isHighlighted: boolean;
  onHoverChange: (pointId: string | null) => void;
};

function EmbeddingPointMesh({
  point,
  size,
  color,
  highlightColor,
  isHighlighted,
  onHoverChange,
}: EmbeddingPointMeshProps) {
  const radius = size * (isHighlighted ? 1.6 : 1);
  const resolvedColor = isHighlighted ? highlightColor : color;

  return (
    <mesh
      position={point.position}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(point.id);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHoverChange(null);
      }}
    >
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial color={resolvedColor} />
    </mesh>
  );
}

type EmbeddingSceneInnerProps = {
  points: EmbeddingPoint[];
  pointSize: number;
  defaultPointColor: string;
  highlightColor: string;
};

function EmbeddingSceneInner({
  points,
  pointSize,
  defaultPointColor,
  highlightColor,
}: EmbeddingSceneInnerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!points.length) {
    return null;
  }

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 4, 2]} intensity={0.8} />
      {points.map((point) => (
        <EmbeddingPointMesh
          key={point.id}
          point={point}
          size={pointSize}
          color={defaultPointColor}
          highlightColor={highlightColor}
          isHighlighted={hoveredId === point.id}
          onHoverChange={setHoveredId}
        />
      ))}
    </>
  );
}

export function EmbeddingScene({
  points,
  pointSize = 0.06,
  backgroundColor = "#020617",
  defaultPointColor = "#4f46e5",
  highlightColor = "#f97316",
}: EmbeddingSceneProps) {
  const { center, radius } = useMemo(() => computeBounds(points), [points]);

  const cameraDistance = radius * 2.5 || 5;

  return (
    <div className="relative h-[360px] w-full md:h-[480px]">
      <Canvas
        className="h-full w-full"
        camera={{
          position: [0, 0, cameraDistance],
          fov: 50,
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={[backgroundColor]} />
        <group position={[-center[0], -center[1], -center[2]]}>
          <EmbeddingSceneInner
            points={points}
            pointSize={pointSize}
            defaultPointColor={defaultPointColor}
            highlightColor={highlightColor}
          />
        </group>
        <OrbitControls enableDamping enablePan enableZoom />
      </Canvas>
    </div>
  );
}
