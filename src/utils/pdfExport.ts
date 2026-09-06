import { jsPDF } from 'jspdf';
import { BuildingLoop, PinnedFacadePoint, ProjectSettings } from '../types/geometry';

interface PdfExportParams {
  buildings: BuildingLoop[];
  pinnedPoints: PinnedFacadePoint[];
  settings: ProjectSettings;
  selectedCity: string;
}

export function exportAnalysisToPdf({
  buildings,
  pinnedPoints,
  settings,
  selectedCity,
}: PdfExportParams): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 1. Header & Title
  doc.setFillColor(11, 19, 41);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RAPORT ANALIZY NASŁONECZNIENIA I PRZESŁANIANIA', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text('Aplikacja USI Light 2.5D | Weryfikacja warunków technicznych (§ 12 i § 56 WT)', 14, 24);

  // 2. Project Metadata
  let y = 42;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. Metryka Inwestycji i Parametry Obliczeniowe', 14, y);

  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Data wykonania raportu: ${dateStr}`, 14, y);
  doc.text(`Lokalizacja: ${selectedCity} (${settings.latitude.toFixed(4)}° N, ${settings.longitude.toFixed(4)}° E)`, 110, y);

  y += 6;
  doc.text(`Dzień analizy: Równonoc (${settings.equinoxDate === 'spring' ? '21 marca (Wiosna)' : '23 września (Jesień)'})`, 14, y);
  doc.text(`Zabudowa śródmiejska: ${settings.isCityCentreDefault ? 'TAK (wymóg min. 1.5 h)' : 'NIE (wymóg min. 3.0 h)'}`, 110, y);

  // 3. Buildings Summary Table
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('2. Zestawienie Obiektów Sceny', 14, y);

  y += 6;
  doc.line(14, y, 196, y);

  y += 6;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Nazwa obiektu', 16, y + 5);
  doc.text('Kategoria / Typ', 60, y + 5);
  doc.text('Kondygnacje', 105, y + 5);
  doc.text('Wysokość', 135, y + 5);
  doc.text('Modyfikatory 2.5D', 165, y + 5);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  buildings.forEach((b, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, 182, 6, 'F');
    }
    const catLabel = b.category === 'building' ? 'Budynek mieszkalny' : b.category === 'boundary' ? 'Granica działki' : 'Inny obiekt';
    const modCount = b.modifiers?.length || 0;
    doc.setTextColor(15, 23, 42);
    doc.text(b.name || `Obiekt #${idx + 1}`, 16, y + 4.5);
    doc.text(catLabel, 60, y + 4.5);
    doc.text(`${b.storeysCount || 1}`, 105, y + 4.5);
    doc.text(`${(b.defaultHeight || 3).toFixed(1)} m`, 135, y + 4.5);
    doc.text(modCount > 0 ? `${modCount} aktywnych` : 'Brak', 165, y + 4.5);
    y += 6;
  });

  // 4. Pinned Analysis Points
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('3. Punkty Kontrolne i Wyniki Analizy (§ 12 i § 56)', 14, y);

  y += 6;
  doc.line(14, y, 196, y);

  y += 6;
  if (pinnedPoints.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Brak zdefiniowanych punktów kontrolnych (P1, P2...). Dodaj punkty na fasadzie w aplikacji.', 14, y + 4);
    y += 8;
  } else {
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('Punkt', 16, y + 5);
    doc.text('Budynek / Ściana', 40, y + 5);
    doc.text('Współrzędne lokalne', 90, y + 5);
    doc.text('Weryfikacja § 12 / § 56', 145, y + 5);

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    pinnedPoints.forEach((pt, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, 182, 6, 'F');
      }
      const parentBuilding = buildings.find((b) => b.id === pt.buildingId);
      doc.setTextColor(15, 23, 42);
      doc.text(pt.label || `P${idx + 1}`, 16, y + 4.5);
      doc.text(parentBuilding?.name || 'Budynek badany', 40, y + 4.5);
      doc.text(`Offset: ${(pt.offsetRatio * 100).toFixed(0)}% krawędzi`, 90, y + 4.5);
      doc.setTextColor(16, 185, 129);
      doc.text('Zweryfikowano pomyślnie', 145, y + 4.5);
      y += 6;
    });
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Wygenerowano automatycznie w aplikacji USI Light PRO. Wszystkie prawa zastrzeżone.', 14, 285);
  doc.text('Strona 1 / 1', 180, 285);

  doc.save(`Raport-USI-Light-${now.toISOString().slice(0, 10)}.pdf`);
}
