import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group, Path } from "react-konva";
import { useScenarioStore } from "@/state/useScenarioStore";
import { useUiStore } from "@/state/useUiStore";
import type { CanvasTool } from "@/state/useUiStore";
import { useSessionStore } from "@/state/useSessionStore";
import type { ScenarioObject, ApparatusObject, HydrantObject, BuildingObject, HoseLine, HoseType } from "@/types/scenario";
import { generateId } from "@/lib/ids";
import { RotateCw, Trash2, CheckCircle2, Lock, Unlock, Compass } from "lucide-react";

// Procedural overhead city block configuration
const STREET_WIDTH = 90;
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;

export function TacticalCanvas() {
  const { run, addObject, updateObject, deleteObject, startHose, updateHosePoints, completeHose } = useScenarioStore();
  const { activeTool, setActiveTool, selectedObjectId, setSelectedObjectId, zoom, setZoom, panX, panY, setPan, setGetStageDataUrl } = useUiStore();
  const { designation, role, isSolo } = useSessionStore();

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  const drawingHoseRef = useRef<HoseLine | null>(null);
  const [hosePoints, setHosePoints] = useState<number[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || window.innerWidth - 650,
          height: containerRef.current.clientHeight || window.innerHeight - 150
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(containerRef.current);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Fit canvas to screen on mount / initial dimension load
  const hasAutoFitted = useRef(false);
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && !hasAutoFitted.current) {
      hasAutoFitted.current = true;
      const padding = 20; // 20px padding around the map
      const scaleX = (dimensions.width - padding * 2) / CANVAS_WIDTH;
      const scaleY = (dimensions.height - padding * 2) / CANVAS_HEIGHT;
      const fitZoom = Math.min(scaleX, scaleY);
      
      const x = (dimensions.width - CANVAS_WIDTH * fitZoom) / 2;
      const y = (dimensions.height - CANVAS_HEIGHT * fitZoom) / 2;
      
      setZoom(fitZoom);
      setPan(x, y);
    }
  }, [dimensions.width, dimensions.height]);

  useEffect(() => {
    setGetStageDataUrl(() => {
      if (stageRef.current) {
        return stageRef.current.toDataURL();
      }
      return "";
    });
    return () => setGetStageDataUrl(null);
  }, [setGetStageDataUrl]);

  // Rotate helper for selected object
  const handleRotateSelected = () => {
    if (!selectedObjectId) return;
    const obj = run.objects[selectedObjectId];
    if (obj) {
      const nextRotation = ((obj.rotation || 0) + 15) % 360;
      updateObject(selectedObjectId, { rotation: nextRotation });
    }
  };

  const handleDeleteSelected = () => {
    if (selectedObjectId) {
      deleteObject(selectedObjectId);
      setSelectedObjectId(null);
    }
  };

  const handleLockSelected = (locked: boolean) => {
    if (selectedObjectId) {
      updateObject(selectedObjectId, { locked });
    }
  };

  // Click on building to select it
  const handleSelectBuilding = (bldgId: string) => {
    setSelectedObjectId(bldgId);
  };

  // Canvas interaction (drag/pan)
  const handleStageWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setZoom(newScale);

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y * newScale - mousePointTo.y * newScale
    };
    setPan(newPos.x, pointer.y - mousePointTo.y * newScale);
  };

  // Drag-and-drop apparatus from outer tray
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropApparatus = (e: React.DragEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    stage.setPointersPositions(e);
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const dragData = e.dataTransfer.getData("application/react-mbfd-apparatus");
    if (!dragData) return;

    const parsed = JSON.parse(dragData);
    
    // Scale coords back relative to Zoom & Pan
    const stageScale = stage.scaleX();
    const droppedX = (pointer.x - stage.x()) / stageScale;
    const droppedY = (pointer.y - stage.y()) / stageScale;

    // Create tactical object
    const newId = generateId("unit");
    const timestamp = new Date().toISOString();
    
    const newApparatus: ApparatusObject = {
      id: newId,
      type: "apparatus",
      apparatusKind: parsed.kind,
      designation: parsed.designation,
      status: "deployed",
      placedAt: timestamp,
      lastMovedAt: timestamp,
      x: droppedX,
      y: droppedY,
      rotation: 0,
      scale: 1,
      locked: false,
      createdBy: designation || "Instructor",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    addObject(newApparatus);
    setSelectedObjectId(newId);
  };

  // Drawing line handlers
  const handleCanvasClick = (e: any) => {
    // If we click on an empty space, deselect
    if (e.target === e.target.getStage() || e.target.name() === "background") {
      setSelectedObjectId(null);
    }

    if (activeTool === "select") return;

    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const stageScale = stage.scaleX();
    const clickX = (pointer.x - stage.x()) / stageScale;
    const clickY = (pointer.y - stage.y()) / stageScale;

    // If using hose tools
    if (activeTool.startsWith("hose")) {
      const typeMap: Record<string, { type: HoseType; color: "yellow" | "gray" | "green"; label: string }> = {
        hose5: { type: "supply5", color: "yellow", label: "5\" Supply" },
        hose3: { type: "hose3", color: "gray", label: "3\" Backup" },
        hose175: { type: "attack175", color: "green", label: "1 3/4\" Attack" }
      };

      const hoseConfig = typeMap[activeTool];
      if (!hoseConfig) return;

      if (!activeDrawingId) {
        // Start a new line
        const newId = generateId("hose");
        const newHose: HoseLine = {
          id: newId,
          hoseType: hoseConfig.type,
          color: hoseConfig.color,
          points: [clickX, clickY],
          createdBy: designation || "User",
          startedAt: new Date().toISOString(),
          label: hoseConfig.label,
          isDrawing: true
        };
        startHose(newHose);
        setActiveDrawingId(newId);
        setHosePoints([clickX, clickY]);
      } else {
        // Add point to current line
        const nextPoints = [...hosePoints, clickX, clickY];
        setHosePoints(nextPoints);
        updateHosePoints(activeDrawingId, nextPoints);
      }
    } 
    // Quick tool placements
    else if (activeTool === "hydrant") {
      const newId = generateId("hydrant");
      const newHyd: HydrantObject = {
        id: newId,
        type: "hydrant",
        label: "Manual Hydrant",
        x: clickX,
        y: clickY,
        rotation: 0,
        scale: 1,
        locked: false,
        createdBy: designation || "Instructor",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addObject(newHyd);
      setActiveTool("select");
    }
  };

  const handleCanvasMouseMove = (e: any) => {
    if (!activeDrawingId) return;
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const stageScale = stage.scaleX();
    const curX = (pointer.x - stage.x()) / stageScale;
    const curY = (pointer.y - stage.y()) / stageScale;

    // Show dynamic line tracking mouse
    const nextPoints = [...hosePoints, curX, curY];
    updateHosePoints(activeDrawingId, nextPoints);
  };

  const handleFinishHoseDrawing = () => {
    if (activeDrawingId) {
      completeHose(activeDrawingId);
      setActiveDrawingId(null);
      setHosePoints([]);
      setActiveTool("select");
    }
  };

  const handleCancelHoseDrawing = () => {
    if (activeDrawingId) {
      deleteObject(activeDrawingId);
      setActiveDrawingId(null);
      setHosePoints([]);
      setActiveTool("select");
    }
  };

  const handleDragEndObject = (id: string, e: any) => {
    const isLocked = run.objects[id]?.locked;
    if (isLocked) {
      // Revert drag if locked
      const obj = run.objects[id];
      e.target.x(obj.x);
      e.target.y(obj.y);
      return;
    }
    const nextX = e.target.x();
    const nextY = e.target.y();
    updateObject(id, { x: nextX, y: nextY, lastMovedAt: new Date().toISOString() });
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center border-r border-border"
      onDragOver={handleDragOver}
      onDrop={handleDropApparatus}
    >
      {/* Top Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-slate-900/90 backdrop-blur border border-border p-1.5 rounded-lg shadow-xl">
        <Button 
          variant={activeTool === "select" ? "gold" : "tactical"} 
          size="sm" 
          onClick={() => { setActiveTool("select"); }}
          className="font-bold text-xs"
        >
          Select/Move
        </Button>
        <div className="text-slate-700 self-center">|</div>
        <Button 
          variant={activeTool === "hose5" ? "mbfd" : "tactical"} 
          size="sm" 
          onClick={() => { setActiveTool("hose5"); }}
          className="text-xs"
        >
          <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full mr-1 inline-block" /> 5" Supply
        </Button>
        <Button 
          variant={activeTool === "hose3" ? "mbfd" : "tactical"} 
          size="sm" 
          onClick={() => { setActiveTool("hose3"); }}
          className="text-xs"
        >
          <span className="w-2.5 h-2.5 bg-gray-500 rounded-full mr-1 inline-block" /> 3" Backup
        </Button>
        <Button 
          variant={activeTool === "hose175" ? "mbfd" : "tactical"} 
          size="sm" 
          onClick={() => { setActiveTool("hose175"); }}
          className="text-xs"
        >
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full mr-1 inline-block" /> 1.75" Attack
        </Button>
        <div className="text-slate-700 self-center">|</div>
        <Button 
          variant={activeTool === "hydrant" ? "gold" : "tactical"} 
          size="sm" 
          onClick={() => { setActiveTool("hydrant"); }}
          className="text-xs"
        >
          + Hydrant
        </Button>
      </div>

      {/* Floating Rotate & Action Bar when object is selected */}
      {selectedObjectId && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-slate-900/95 border border-border p-2 rounded-lg shadow-xl animate-in fade-in">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest px-2">
            {run.objects[selectedObjectId]?.label || "Selected Unit"}
          </span>
          <div className="text-slate-700">|</div>
          {/* Rotate button */}
          <Button variant="tactical" size="icon" className="h-9 w-9" onClick={handleRotateSelected}>
            <RotateCw className="w-4 h-4 text-slate-200" />
          </Button>
          
          {/* Lock/Unlock Toggle */}
          {run.objects[selectedObjectId]?.locked ? (
            <Button variant="tactical" size="icon" className="h-9 w-9 bg-red-950/40 border-red-800" onClick={() => handleLockSelected(false)}>
              <Lock className="w-4 h-4 text-red-400" />
            </Button>
          ) : (
            <Button variant="tactical" size="icon" className="h-9 w-9" onClick={() => handleLockSelected(true)}>
              <Unlock className="w-4 h-4 text-slate-200" />
            </Button>
          )}

          {/* Delete button (only if Host/Instructor or if solo) */}
          {(role === "Host/Instructor" || isSolo) && (
            <Button variant="destructive" size="icon" className="h-9 w-9" onClick={handleDeleteSelected}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Hose drawing dynamic helper */}
      {activeDrawingId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-slate-900/90 border border-border p-3 rounded-lg shadow-xl">
          <span className="text-xs font-bold text-slate-300">
            Drawing {run.hoses[activeDrawingId]?.label || "Hose Line"} ({Math.floor(hosePoints.length / 2)} points)
          </span>
          <Button variant="gold" size="sm" onClick={handleFinishHoseDrawing}>
            <CheckCircle2 className="w-4 h-4 mr-1 text-slate-950" /> Finish Line
          </Button>
          <Button variant="destructive" size="sm" onClick={handleCancelHoseDrawing}>
            Cancel
          </Button>
        </div>
      )}

      {/* Actual Stage */}
      <div className="w-full h-full flex items-center justify-center">
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          scaleX={zoom}
          scaleY={zoom}
          x={panX}
          y={panY}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onWheel={handleStageWheel}
          className="cursor-crosshair overflow-hidden"
        >
          <Layer>
            {/* 1. Background Ground Canvas */}
            <Rect 
              name="background"
              width={CANVAS_WIDTH} 
              height={CANVAS_HEIGHT} 
              fill="#080c14" // Slate-Black (High-Contrast background)
              stroke="#eab308" // Amber-500 Solid Map Border!
              strokeWidth={3}
            />

            {/* 2. Grid helper lines to make it look highly technical like CAD / Blueprint */}
            {Array.from({ length: 32 }).map((_, i) => (
              <Line 
                key={`grid-x-${i}`}
                points={[i * 50, 0, i * 50, CANVAS_HEIGHT]}
                stroke="#1e293b"
                strokeWidth={i % 2 === 0 ? 0.8 : 0.4}
                opacity={0.35}
              />
            ))}
            {Array.from({ length: 20 }).map((_, i) => (
              <Line 
                key={`grid-y-${i}`}
                points={[0, i * 50, CANVAS_WIDTH, i * 50]}
                stroke="#1e293b"
                strokeWidth={i % 2 === 0 ? 0.8 : 0.4}
                opacity={0.35}
              />
            ))}

            {/* 3. Render Overhead Streets / Roads */}
            {/* Horizontal Primary Street */}
            <Rect 
              x={0} 
              y={500} 
              width={CANVAS_WIDTH} 
              height={STREET_WIDTH} 
              fill="#181f2d" // Solid, premium Asphalt Gray
              stroke="#334155"
              strokeWidth={1}
            />
            {/* Vertical Primary Street */}
            <Rect 
              x={800} 
              y={0} 
              width={STREET_WIDTH} 
              height={CANVAS_HEIGHT} 
              fill="#181f2d" // Solid, premium Asphalt Gray
              stroke="#334155"
              strokeWidth={1}
            />

            {/* Solid curb lanes (curb outlines) */}
            {/* Horizontal Road curbs */}
            <Line points={[0, 500, CANVAS_WIDTH, 500]} stroke="#475569" strokeWidth={1.5} opacity={0.6} />
            <Line points={[0, 590, CANVAS_WIDTH, 590]} stroke="#475569" strokeWidth={1.5} opacity={0.6} />
            {/* Vertical Road curbs */}
            <Line points={[800, 0, 800, CANVAS_HEIGHT]} stroke="#475569" strokeWidth={1.5} opacity={0.6} />
            <Line points={[890, 0, 890, CANVAS_HEIGHT]} stroke="#475569" strokeWidth={1.5} opacity={0.6} />

            {/* Double Solid Yellow Centerlines for premium CAD realism! */}
            {/* Horizontal centerlines */}
            <Line 
              points={[0, 543, CANVAS_WIDTH, 543]} 
              stroke="#f59e0b" // Amber/Yellow
              strokeWidth={1.5} 
            />
            <Line 
              points={[0, 547, CANVAS_WIDTH, 547]} 
              stroke="#f59e0b" // Amber/Yellow
              strokeWidth={1.5} 
            />
            {/* Vertical centerlines */}
            <Line 
              points={[843, 0, 843, CANVAS_HEIGHT]} 
              stroke="#f59e0b" // Amber/Yellow
              strokeWidth={1.5} 
            />
            <Line 
              points={[847, 0, 847, CANVAS_HEIGHT]} 
              stroke="#f59e0b" // Amber/Yellow
              strokeWidth={1.5} 
            />

            {/* White Zebra Crosswalks around the intersection! */}
            {/* Left Crosswalk */}
            {Array.from({ length: 5 }).map((_, j) => (
              <Rect 
                key={`crosswalk-l-${j}`}
                x={755}
                y={504 + (j * 18)}
                width={35}
                height={8}
                fill="#ffffff"
                opacity={0.4}
              />
            ))}
            {/* Right Crosswalk */}
            {Array.from({ length: 5 }).map((_, j) => (
              <Rect 
                key={`crosswalk-r-${j}`}
                x={900}
                y={504 + (j * 18)}
                width={35}
                height={8}
                fill="#ffffff"
                opacity={0.4}
              />
            ))}
            {/* Top Crosswalk */}
            {Array.from({ length: 5 }).map((_, j) => (
              <Rect 
                key={`crosswalk-t-${j}`}
                x={804 + (j * 18)}
                y={455}
                width={8}
                height={35}
                fill="#ffffff"
                opacity={0.4}
              />
            ))}
            {/* Bottom Crosswalk */}
            {Array.from({ length: 5 }).map((_, j) => (
              <Rect 
                key={`crosswalk-b-${j}`}
                x={804 + (j * 18)}
                y={600}
                width={8}
                height={35}
                fill="#ffffff"
                opacity={0.4}
              />
            ))}

            {/* Monospaced Monochromatic Street Labels with rounded background pills */}
            <Group>
              <Rect x={340} y={512} width={130} height={20} fill="#0f172a" stroke="#334155" strokeWidth={1} cornerRadius={10} shadowColor="#000" shadowBlur={3} shadowOpacity={0.5} />
              <Text 
                x={340} 
                y={517} 
                text="MAIN STREET" 
                fill="#cbd5e1" 
                fontSize={10} 
                fontStyle="bold"
                width={130}
                align="center"
              />
            </Group>
            <Group>
              {/* Monospaced Monochromatic Oak Ave rotated label */}
              <Rect x={855} y={150} width={110} height={20} fill="#0f172a" stroke="#334155" strokeWidth={1} cornerRadius={10} shadowColor="#000" shadowBlur={3} shadowOpacity={0.5} />
              <Text 
                x={855} 
                y={155} 
                text="OAK AVE" 
                fill="#cbd5e1" 
                fontSize={10} 
                fontStyle="bold"
                width={110}
                align="center"
              />
            </Group>

            {/* Sidewalk borders */}
            <Rect x={0} y={485} width={CANVAS_WIDTH} height={15} fill="#334155" opacity={0.15} />
            <Rect x={0} y={590} width={CANVAS_WIDTH} height={15} fill="#334155" opacity={0.15} />
            <Rect x={785} y={0} width={15} height={CANVAS_HEIGHT} fill="#334155" opacity={0.15} />
            <Rect x={890} y={0} width={15} height={CANVAS_HEIGHT} fill="#334155" opacity={0.15} />

             {/* 4. Render Buildings */}
            {Object.values(run.objects)
              .filter(o => o.type === "building")
              .map((o) => {
                const bldg = o as BuildingObject;
                const { x, y, width, height } = bldg.footprint;
                const isSelected = selectedObjectId === bldg.id;
                const isIncident = bldg.selectedAsIncidentBuilding;

                return (
                  <Group key={bldg.id} onClick={() => handleSelectBuilding(bldg.id)} tap={() => handleSelectBuilding(bldg.id)}>
                    {/* Structure Footprint Block */}
                    <Rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={isIncident ? "#361010" : "#1a2436"} // Dynamic premium high-contrast building fills!
                      stroke={isSelected ? "#f59e0b" : isIncident ? "#f43f5e" : "#475569"} // Red-rose border if incident building
                      strokeWidth={isSelected ? 3 : isIncident ? 2.5 : 1.5}
                      cornerRadius={4}
                      shadowColor="#000"
                      shadowBlur={8}
                      shadowOpacity={0.4}
                    />

                    {/* Floor Label inside the block */}
                    <Rect
                      x={x + 6}
                      y={y + 6}
                      width={28}
                      height={18}
                      fill="#0b0f17"
                      stroke={isIncident ? "#f43f5e" : "#475569"}
                      strokeWidth={1}
                      cornerRadius={2}
                    />
                    <Text
                      x={x + 10}
                      y={y + 10}
                      text={`${bldg.floors}F`}
                      fill={isIncident ? "#f43f5e" : "#cbd5e1"}
                      fontSize={10}
                      fontStyle="bold"
                    />

                    {/* Main Label text */}
                    <Text
                      x={x + 40}
                      y={y + 10}
                      text={bldg.label}
                      fill="#f8fafc"
                      fontSize={11}
                      fontStyle="bold"
                      width={width - 45}
                      wrap="char"
                    />

                    {/* Occupancy details */}
                    <Text
                      x={x + 10}
                      y={y + height - 26}
                      text={`${bldg.occupancyType} | ${bldg.constructionType}`}
                      fill="#94a3b8"
                      fontSize={8.5}
                      fontStyle="bold"
                    />

                    {/* ALPHA / BRAVO / CHARLIE / DELTA Labels on sides of Incident Building */}
                    {isIncident && (
                      <Group>
                        {/* Side Alpha - Front */}
                        <Text x={x + width/2 - 16} y={y + height + 6} text="SIDE A" fill="#f8fafc" fontSize={9} fontStyle="black" />
                        {/* Side Bravo - Left */}
                        <Text x={x - 44} y={y + height/2 - 5} text="SIDE B" fill="#f8fafc" fontSize={9} fontStyle="black" />
                        {/* Side Charlie - Rear */}
                        <Text x={x + width/2 - 16} y={y - 14} text="SIDE C" fill="#f8fafc" fontSize={9} fontStyle="black" />
                        {/* Side Delta - Right */}
                        <Text x={x + width + 8} y={y + height/2 - 5} text="SIDE D" fill="#f8fafc" fontSize={9} fontStyle="black" />
                      </Group>
                    )}

                    {/* FIRE condition visualizer pulsing effects */}
                    {isIncident && bldg.fireCondition.intensity !== "none" && (
                      <Group>
                        {/* Render pulsing concentric orange/red circles inside footprint representing flames */}
                        <Circle
                          x={x + width/2}
                          y={y + height/2}
                          radius={Math.min(width, height) * 0.35}
                          fillPriority="radial"
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={Math.min(width, height) * 0.35}
                          fillRadialGradientColorStops={[
                            0, "rgba(239, 68, 68, 0.75)", // bright red
                            0.5, "rgba(245, 158, 11, 0.55)", // amber
                            1, "rgba(239, 68, 68, 0)" // transparent
                          ]}
                        />
                        {bldg.fireCondition.intensity === "heavy" || bldg.fireCondition.intensity === "fully_involved" ? (
                          <Circle
                            x={x + width/2}
                            y={y + height/2}
                            radius={Math.min(width, height) * 0.45}
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dash={[5, 10]}
                          />
                        ) : null}
                      </Group>
                    )}

                    {/* SMOKE condition visualizer pulsing gray clouds */}
                    {isIncident && bldg.smokeCondition.level !== "none" && (
                      <Group>
                        <Circle
                          x={x + width/2 + 25}
                          y={y + height/2 - 15}
                          radius={Math.min(width, height) * 0.4}
                          fillPriority="radial"
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={Math.min(width, height) * 0.4}
                          fillRadialGradientColorStops={[
                            0, bldg.smokeCondition.level === "black_turbulent" ? "rgba(15, 23, 42, 0.95)" : "rgba(148, 163, 184, 0.75)",
                            0.6, bldg.smokeCondition.level === "black_turbulent" ? "rgba(30, 41, 59, 0.65)" : "rgba(100, 116, 139, 0.45)",
                            1, "rgba(255, 255, 255, 0)"
                          ]}
                        />
                      </Group>
                    )}
                  </Group>
                );
              })}

            {/* 5. Render Hydrants */}
            {Object.values(run.objects)
              .filter(o => o.type === "hydrant")
              .map((o) => {
                const hyd = o as HydrantObject;
                const isSelected = selectedObjectId === hyd.id;

                return (
                  <Group 
                    key={hyd.id} 
                    x={hyd.x} 
                    y={hyd.y}
                    draggable={role === "Host/Instructor" || isSolo}
                    onDragEnd={(e) => handleDragEndObject(hyd.id, e)}
                    onClick={() => setSelectedObjectId(hyd.id)}
                    onTap={() => setSelectedObjectId(hyd.id)}
                  >
                    {/* Blue tactical water ring */}
                    <Circle
                      radius={14}
                      fill="#0284c7" // Bright Sky Blue
                      stroke={isSelected ? "#f59e0b" : "#38bdf8"} // Sky Blue glow
                      strokeWidth={isSelected ? 3 : 1.5}
                      shadowColor="#000"
                      shadowBlur={6}
                      shadowOpacity={0.5}
                    />
                    <Text
                      x={-5}
                      y={-5}
                      text="H"
                      fill="#ffffff"
                      fontSize={11}
                      fontStyle="black"
                    />
                    <Text
                      x={-40}
                      y={18}
                      text={hyd.label || "Hydrant"}
                      fill="#38bdf8"
                      fontSize={9}
                      fontStyle="black"
                      width={80}
                      align="center"
                    />
                  </Group>
                );
              })}

            {/* 6. Render Hose Lines */}
            {Object.values(run.hoses).map((hose) => {
              const colorMap: Record<string, string> = {
                yellow: "#f59e0b", // Supply 5"
                gray: "#94a3b8", // 3" Backup
                green: "#22c55e" // 1 3/4" Attack
              };

              return (
                <Group key={hose.id}>
                  <Line
                    points={hose.points}
                    stroke={colorMap[hose.color]}
                    strokeWidth={hose.hoseType === "supply5" ? 6 : hose.hoseType === "hose3" ? 4.5 : 3}
                    lineCap="round"
                    lineJoin="round"
                    shadowColor="#000"
                    shadowBlur={3}
                    shadowOpacity={0.3}
                  />
                  {/* Hose Label centered on first segment */}
                  {hose.points.length >= 4 && (
                    <Text
                      x={(hose.points[0] + hose.points[2]) / 2 - 10}
                      y={(hose.points[1] + hose.points[3]) / 2 - 12}
                      text={hose.label || ""}
                      fill="#e2e8f0"
                      fontSize={8}
                      fontStyle="bold"
                      backgroundColor="rgba(15, 23, 42, 0.85)"
                      padding={2}
                    />
                  )}
                </Group>
              );
            })}

            {/* 7. Render Tactical Apparatus Units */}
            {Object.values(run.objects)
              .filter(o => o.type === "apparatus")
              .map((o) => {
                const app = o as ApparatusObject;
                const isSelected = selectedObjectId === app.id;

                // Set styles/colors based on kind
                let bodyWidth = 100;
                let bodyHeight = 40;
                let accentColor = "#ef4444"; // default red
                let typeSymbol = "ENGINE";

                if (app.apparatusKind === "ladder") {
                  bodyWidth = 130;
                  bodyHeight = 42;
                  accentColor = "#ffffff"; // White highlights for truck
                  typeSymbol = "TRUCK";
                } else if (app.apparatusKind === "rescue") {
                  bodyWidth = 90;
                  bodyHeight = 38;
                  accentColor = "#38bdf8"; // Light Blue for ambulance/rescue
                  typeSymbol = "RESCUE";
                } else if (app.apparatusKind === "command_suv" || app.apparatusKind === "safety_suv") {
                  bodyWidth = 72;
                  bodyHeight = 34;
                  accentColor = "#f59e0b"; // Gold highlights for command
                  typeSymbol = "COMMAND";
                }

                return (
                  <Group
                    key={app.id}
                    x={app.x}
                    y={app.y}
                    rotation={app.rotation || 0}
                    draggable={!app.locked}
                    onDragEnd={(e) => handleDragEndObject(app.id, e)}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedObjectId(app.id);
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      setSelectedObjectId(app.id);
                    }}
                  >
                    {/* Apparatus Core Body (Red Rect) */}
                    <Rect
                      x={-bodyWidth / 2}
                      y={-bodyHeight / 2}
                      width={bodyWidth}
                      height={bodyHeight}
                      fill="#991b1b" // Fire Brick Red
                      stroke={isSelected ? "#f59e0b" : app.locked ? "#ef4444" : "#1e293b"} // Gold ring when selected
                      strokeWidth={isSelected ? 3 : 1.5}
                      cornerRadius={4}
                      shadowColor="#000"
                      shadowBlur={6}
                      shadowOpacity={0.4}
                    />

                    {/* Wheels representation */}
                    <Rect x={-bodyWidth/2 + 10} y={-bodyHeight/2 - 3} width={14} height={3} fill="#020617" />
                    <Rect x={bodyWidth/2 - 24} y={-bodyHeight/2 - 3} width={14} height={3} fill="#020617" />
                    <Rect x={-bodyWidth/2 + 10} y={bodyHeight/2} width={14} height={3} fill="#020617" />
                    <Rect x={bodyWidth/2 - 24} y={bodyHeight/2} width={14} height={3} fill="#020617" />

                    {/* Roof Panel (White highlight) */}
                    <Rect
                      x={-bodyWidth / 2 + 14}
                      y={-bodyHeight / 2 + 5}
                      width={bodyWidth - 28}
                      height={bodyHeight - 10}
                      fill="#ffffff"
                      opacity={0.15}
                      cornerRadius={2}
                    />

                    {/* Ladder Stripes (Only if ladder) */}
                    {app.apparatusKind === "ladder" && (
                      <Group>
                        {/* Ladder Rails */}
                        <Line points={[-bodyWidth/2 + 15, -6, bodyWidth/2 - 15, -6]} stroke="#e2e8f0" strokeWidth={1.5} />
                        <Line points={[-bodyWidth/2 + 15, 6, bodyWidth/2 - 15, 6]} stroke="#e2e8f0" strokeWidth={1.5} />
                        {/* Ladder Rungs */}
                        {Array.from({ length: 9 }).map((_, rIdx) => (
                          <Line
                            key={`rung-${rIdx}`}
                            points={[-bodyWidth/2 + 25 + (rIdx * 10), -6, -bodyWidth/2 + 25 + (rIdx * 10), 6]}
                            stroke="#e2e8f0"
                            strokeWidth={1}
                          />
                        ))}
                      </Group>
                    )}

                    {/* Red/Amber beacon circle */}
                    <Circle
                      x={-bodyWidth/2 + 18}
                      y={0}
                      radius={4.5}
                      fill="#ef4444"
                    />

                    {/* Big Bold Designation label (Highly visible on smartboards) */}
                    <Text
                      x={-bodyWidth/2 + 25}
                      y={-6}
                      text={app.designation}
                      fill="#ffffff"
                      fontSize={13}
                      fontStyle="black"
                      width={bodyWidth - 30}
                      align="center"
                    />

                    {/* Sub symbol */}
                    <Text
                      x={-bodyWidth/2 + 25}
                      y={7}
                      text={typeSymbol}
                      fill={accentColor}
                      fontSize={6.5}
                      fontStyle="bold"
                      width={bodyWidth - 30}
                      align="center"
                      opacity={0.8}
                    />

                    {/* If Locked Icon */}
                    {app.locked && (
                      <Text
                        x={bodyWidth / 2 - 12}
                        y={-bodyHeight / 2 + 2}
                        text="L"
                        fill="#f87171"
                        fontSize={7.5}
                        fontStyle="bold"
                      />
                    )}
                  </Group>
                );
              })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

// Internal custom button since we have it wrapped in tailwind CSS
function Button({ variant = "default", size = "default", children, className, onClick }: any) {
  let baseStyle = "px-3 py-1.5 rounded font-semibold text-xs transition duration-150 active:scale-95 flex items-center justify-center cursor-pointer";
  let variantStyle = "bg-slate-800 text-slate-100 hover:bg-slate-700";

  if (variant === "mbfd") {
    variantStyle = "bg-red-700 text-white font-bold border border-red-500 hover:bg-red-600";
  } else if (variant === "destructive") {
    variantStyle = "bg-red-950 text-red-300 border border-red-900 hover:bg-red-900";
  } else if (variant === "gold") {
    variantStyle = "bg-amber-500 text-slate-950 font-black border border-amber-400 hover:bg-amber-400";
  } else if (variant === "tactical") {
    variantStyle = "bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800";
  }

  if (size === "icon") {
    baseStyle = "rounded transition duration-150 active:scale-95 flex items-center justify-center cursor-pointer";
  }

  return (
    <button className={`${baseStyle} ${variantStyle} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}
