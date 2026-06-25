import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScenarioRun } from "@/types/scenario";
import { formatElapsed, formatDateTime } from "./time";

export function exportAfterActionReport(run: ScenarioRun, screenshotBase64?: string) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 15;

  // Helpers
  const addHeader = (title: string) => {
    if (currentY > pageHeight - 30) {
      doc.addPage();
      currentY = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(190, 24, 24); // Red accent
    doc.text(title, 15, currentY);
    doc.setDrawColor(200, 200, 200);
    doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);
    currentY += 10;
  };

  const addText = (text: string, style: "bold" | "normal" = "normal", size = 10, color = [30, 41, 59]) => {
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = 15;
    }
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    
    // Auto wrap text
    const lines = doc.splitTextToSize(text, pageWidth - 30);
    lines.forEach((line: string) => {
      doc.text(line, 15, currentY);
      currentY += size * 0.4 + 2;
    });
  };

  const addLabelValue = (label: string, value: string) => {
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`${label}:`, 15, currentY);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const valueX = 55;
    const lines = doc.splitTextToSize(value, pageWidth - valueX - 15);
    lines.forEach((line: string, i: number) => {
      doc.text(line, valueX, currentY + (i * 5));
    });
    currentY += Math.max(5, lines.length * 5) + 2;
  };

  // --- FIRST PAGE COVER / HEADER ---
  // Title Bar
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("MBFD TACTICAL SCENE SIMULATOR", 15, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(245, 158, 11); // Gold/Amber
  doc.text("AFTER-ACTION REPORT & TACTICAL LOG", 15, 28);

  currentY = 50;

  // Metadata Block
  addHeader("Scenario Run Details");
  addLabelValue("Scenario Name", run.scenarioTitle);
  addLabelValue("Run Room Code", run.roomCode);
  addLabelValue("Date/Time", formatDateTime(new Date().toISOString()));
  addLabelValue("Active Roster", Object.values(run.roster).length > 0 
    ? Object.values(run.roster).map(r => `${r.designation} (${r.role})`).join(", ")
    : "Local Solo Run"
  );

  // Add screenshot of the final board if available
  if (screenshotBase64) {
    if (currentY > pageHeight - 110) {
      doc.addPage();
      currentY = 15;
    }
    addHeader("Final Tactical Board Screenshot");
    try {
      // screenshotBase64 is a dataUrl, we strip header
      const imgData = screenshotBase64.includes(",") ? screenshotBase64.split(",")[1] : screenshotBase64;
      // Width = pageWidth - 30 (approx 180mm), Maintain proportion (stage aspect ratio is usually 4:3)
      const imgWidth = pageWidth - 30;
      const imgHeight = (imgWidth * 4) / 7; // Approx 100mm height
      doc.addImage(imgData, "PNG", 15, currentY, imgWidth, imgHeight);
      currentY += imgHeight + 10;
    } catch (e) {
      console.error("Failed to add image to PDF:", e);
      addText("[Error embedding tactical board screenshot]", "normal", 10, [153, 27, 27]);
    }
  }

  // --- SECOND PAGE: APPARATUS & HOSES ---
  doc.addPage();
  currentY = 15;

  addHeader("Tactical Apparatus Placement Summary");
  const apparatusRows = Object.values(run.objects)
    .filter(obj => obj.type === "apparatus")
    .map(obj => {
      const app = obj as any;
      return [
        app.designation,
        app.apparatusKind.toUpperCase().replace("_", " "),
        app.status.toUpperCase(),
        app.placedAt ? formatDateTime(app.placedAt) : "N/A"
      ];
    });

  if (apparatusRows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [["Unit", "Apparatus Type", "Current Status", "Placed At"]],
      body: apparatusRows,
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42] }
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    addText("No tactical apparatus units were placed in this scenario.", "normal");
    currentY += 5;
  }

  addHeader("Hose Line Summary");
  const hoseRows = Object.values(run.hoses).map(hose => {
    let typeName = "Attack 1 3/4\"";
    if (hose.hoseType === "supply5") typeName = "Supply 5\"";
    else if (hose.hoseType === "hose3") typeName = "Backup 3\"";

    return [
      hose.id,
      typeName,
      hose.label || "N/A",
      hose.completedAt ? "COMPLETED" : "IN PROGRESS",
      hose.startedAt ? formatDateTime(hose.startedAt) : "N/A"
    ];
  });

  if (hoseRows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [["Hose ID", "Hose Diameter", "Label / Purpose", "Status", "Laid At"]],
      body: hoseRows,
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42] }
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    addText("No hose line evolutions were established in this scenario.", "normal");
    currentY += 5;
  }

  // --- THIRD PAGE: REPORTS, PLANS & CHECKLISTS ---
  if (run.radioReports.length > 0 || run.tacticalPlans.length > 0 || Object.keys(run.tacticalConsiderations).length > 0) {
    doc.addPage();
    currentY = 15;

    if (run.radioReports.length > 0) {
      addHeader("Initial Radio Size-Up Report (IRR)");
      run.radioReports.forEach((rep) => {
        addText(`Submitted by ${rep.actor} at ${formatDateTime(rep.submittedAt)}:`, "bold");
        addText(`- Structure: ${rep.buildingType} (${rep.occupancy})`, "normal");
        addText(`- Conditions: ${rep.conditionsShowing}`, "normal");
        addText(`- Initial Actions: ${rep.action}`, "normal");
        addText(`- Strategy: ${rep.strategy.toUpperCase()}`, "bold", 10, [190, 24, 24]);
        addText(`- Command Name: ${rep.commandName}`, "normal");
        currentY += 3;
      });
      currentY += 5;
    }

    if (run.tacticalPlans.length > 0) {
      addHeader("Tactical Action Plan (TAP)");
      run.tacticalPlans.forEach((plan) => {
        addText(`Submitted by ${plan.actor} at ${formatDateTime(plan.submittedAt)}:`, "bold");
        addText(`- Global Strategy: ${plan.strategy}`, "normal");
        addText(`- First Hose Line Placement Rationale: ${plan.firstLinePlacement}`, "normal");
        addText(`- Primary Search Plan: ${plan.searchPlan}`, "normal");
        addText(`- Ventilation Plan: ${plan.ventPlan}`, "normal");
        addText(`- Water Supply Plan: ${plan.waterSupplyPlan}`, "normal");
        addText(`- Upcoming Unit Assignments: ${plan.assignmentsNextUnits}`, "normal");
        addText(`- Identified Safety Concerns: ${plan.safetyConcerns}`, "normal");
        currentY += 3;
      });
      currentY += 5;
    }

    const tcRows = Object.values(run.tacticalConsiderations).map(tc => {
      return [
        tc.category,
        tc.status,
        tc.assignedUnit || "Unassigned",
        tc.notes || "None"
      ];
    });

    if (tcRows.length > 0) {
      addHeader("Tactical Objective Checklist");
      autoTable(doc, {
        startY: currentY,
        head: [["Objective Category", "Status", "Assigned Unit", "Checklist / Tactical Notes"]],
        body: tcRows,
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42] }
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // --- FINAL PAGE: FULL TIMELINE LOG ---
  doc.addPage();
  currentY = 15;

  addHeader("Complete Scenario Event Timeline");
  const timelineRows = run.timeline.map(evt => {
    return [
      formatElapsed(evt.elapsedSeconds),
      formatDateTime(evt.absoluteTimestamp),
      evt.actor,
      evt.description
    ];
  });

  if (timelineRows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [["Elapsed Time", "Absolute Time", "Actor", "Logged Event Details"]],
      body: timelineRows,
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42] }
    });
  } else {
    addText("No timeline events logged in this session.", "normal");
  }

  // Save the PDF
  const filename = `mbfd_AAR_${run.roomCode}_${run.scenarioTitle.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
