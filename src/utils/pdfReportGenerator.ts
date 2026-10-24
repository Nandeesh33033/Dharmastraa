import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Subject, Question } from '../constants';
import { evaluateStudentSubmission } from './scoreCalculator';
import { getViolationInfo } from './violationFormatter';

export interface StudentReportData {
  studentName: string;
  studentId: string;
  subjectName: string;
  subjectCode: string;
  submittedAt?: string;
  answers?: Record<string | number, any>;
  trustScore: number;
  isElectronicDevice?: boolean;
  isDisqualified?: boolean;
  terminationReason?: string;
  evidenceScreenshot?: string;
  lastViolationSnapshot?: string;
  violationsList?: Array<{
    type: string;
    timestamp?: string | number;
    details?: any;
    screenshot?: string;
  }>;
  questions?: Question[];
}

export interface SubjectClassReportData {
  subject: Subject;
  students: StudentReportData[];
  generatedBy?: string;
}

/**
 * Safely load and convert image to a format ready for jsPDF embedding
 */
function loadImageForPDF(src: string): Promise<{ dataUrl: string; width: number; height: number; format: string } | null> {
  return new Promise((resolve) => {
    if (!src || typeof src !== 'string') {
      return resolve(null);
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const w = img.naturalWidth || 640;
        const h = img.naturalHeight || 480;

        // If it's already a JPEG or PNG data URL, we can use it directly
        if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
          return resolve({ dataUrl: src, width: w, height: h, format: 'JPEG' });
        }
        if (src.startsWith('data:image/png')) {
          return resolve({ dataUrl: src, width: w, height: h, format: 'PNG' });
        }

        // Convert any other format or web url to JPEG via canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        // Fill background with dark slate in case of transparency
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve({ dataUrl, width: w, height: h, format: 'JPEG' });
      } catch (e) {
        console.warn('Could not process image for PDF embedding:', e);
        resolve(null);
      }
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Generate and download a single student's complete performance & proctoring PDF report.
 * Embeds actual photo evidence images directly into the document.
 */
export async function generateStudentPerformancePDF(data: StudentReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor: [number, number, number] = [49, 46, 129]; // Indigo-900
  const accentColor: [number, number, number] = [79, 70, 229]; // Indigo-600
  const darkTextColor: [number, number, number] = [30, 41, 59]; // Slate-800
  const lightGray: [number, number, number] = [241, 245, 249]; // Slate-100
  const dangerColor: [number, number, number] = [220, 38, 38]; // Red-600
  const successColor: [number, number, number] = [22, 163, 74]; // Emerald-600

  const questionsList = data.questions && data.questions.length > 0 ? data.questions : [];
  const isDisqualified = !!(data.isDisqualified || data.isElectronicDevice);
  const performance = evaluateStudentSubmission(data.answers, questionsList, isDisqualified);

  const totalQuestions = performance.totalQuestions;
  const questionsAttended = performance.questionResults.filter(q => q.status !== 'unanswered').length;
  const earnedPoints = performance.earnedPoints;
  const totalPoints = performance.totalPoints;
  const percentage = performance.percentage;
  const trustScore = Math.max(0, data.trustScore ?? 100);

  // Top Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT PERFORMANCE & PROCTORING AUDIT REPORT', 14, 13);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Official Academic Verification & Photo Evidence Report | Subject: ${data.subjectCode} - ${data.subjectName}`, 14, 21);

  // Student & Exam Metadata Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(...lightGray);
  doc.roundedRect(14, 33, 182, 38, 3, 3, 'FD');

  doc.setTextColor(...darkTextColor);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT INFORMATION', 20, 41);
  doc.text('EXAMINATION DETAILS', 110, 41);

  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(20, 43, 95, 43);
  doc.line(110, 43, 185, 43);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  // Student column
  doc.text('Student Name:', 20, 49);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkTextColor);
  doc.text(String(data.studentName || 'Student Name'), 50, 49);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Student Roll No:', 20, 56);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accentColor);
  doc.text(String(data.studentId || 'N/A'), 50, 56);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Submission Status:', 20, 63);
  doc.setFont('helvetica', 'bold');
  if (isDisqualified) {
    doc.setTextColor(...dangerColor);
    doc.text('DISQUALIFIED / TERMINATED', 50, 63);
  } else {
    doc.setTextColor(...successColor);
    doc.text('COMPLETED & SUBMITTED', 50, 63);
  }

  // Exam column
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Subject Paper:', 110, 49);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkTextColor);
  doc.text(`${data.subjectName} (${data.subjectCode})`, 140, 49);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Exam Date & Time:', 110, 56);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkTextColor);
  const examDateStr = data.submittedAt ? new Date(data.submittedAt).toLocaleString() : new Date().toLocaleString();
  doc.text(examDateStr, 140, 56);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Report Generated:', 110, 63);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), 140, 63);

  // Performance Summary Cards Table
  autoTable(doc, {
    startY: 76,
    head: [['Total Questions', 'Questions Attended', 'Total Marks Earned', 'Percentage', 'Grade', 'Trust Score']],
    body: [[
      String(totalQuestions),
      String(questionsAttended),
      `${earnedPoints} / ${totalPoints} Marks`,
      `${percentage}%`,
      `Grade ${performance.grade}`,
      `${trustScore}%`
    ]],
    headStyles: {
      fillColor: accentColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9.5,
      fontStyle: 'bold',
      halign: 'center',
      textColor: darkTextColor
    },
    theme: 'grid',
    margin: { left: 14, right: 14 }
  });

  let currentY = ((doc as any).lastAutoTable?.finalY || 100) + 7;

  // Collect evidence snapshots with corresponding label
  const collectedSnapshots: Array<{ title: string; subtitle: string; src: string; severity: string }> = [];
  const addedSrcSet = new Set<string>();

  if (data.evidenceScreenshot && !addedSrcSet.has(data.evidenceScreenshot)) {
    addedSrcSet.add(data.evidenceScreenshot);
    collectedSnapshots.push({
      title: 'Primary Infraction Evidence',
      subtitle: data.terminationReason || (data.isElectronicDevice ? 'Electronic Device Detection' : 'Proctoring Alert Snapshot'),
      src: data.evidenceScreenshot,
      severity: 'CRITICAL'
    });
  }

  if (data.lastViolationSnapshot && !addedSrcSet.has(data.lastViolationSnapshot)) {
    addedSrcSet.add(data.lastViolationSnapshot);
    collectedSnapshots.push({
      title: 'Violation Camera Capture',
      subtitle: 'Real-time webcam snapshot recorded during proctoring flag',
      src: data.lastViolationSnapshot,
      severity: 'HIGH'
    });
  }

  // Check individual violations in list for screenshots
  if (data.violationsList && data.violationsList.length > 0) {
    data.violationsList.forEach((v, idx) => {
      if (v.screenshot && !addedSrcSet.has(v.screenshot)) {
        addedSrcSet.add(v.screenshot);
        const info = getViolationInfo(v.type);
        const timeStr = v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : `Incident #${idx + 1}`;
        collectedSnapshots.push({
          title: `Mistake #${idx + 1}: ${info.title || v.type}`,
          subtitle: `Time: ${timeStr} | ${info.description || 'Infraction recorded'}`,
          src: v.screenshot,
          severity: info.severity || 'HIGH'
        });
      }
    });
  }

  // Section Header: Mistakes Committed List
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, 182, 7.5, 2, 2, 'FD');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkTextColor);
  doc.text('PROCTORING MISTAKES & INTEGRITY VIOLATIONS COMMITTED (TEXT FORMAT)', 18, currentY + 5);

  currentY += 10.5;

  // Build Mistake Items (Pure text format, no image names or paths)
  const violations = data.violationsList || [];
  const formattedMistakes: Array<[string, string, string, string, string]> = [];

  if (data.isElectronicDevice) {
    formattedMistakes.push([
      '1',
      'ELECTRONIC_DEVICE_USAGE',
      data.submittedAt ? new Date(data.submittedAt).toLocaleTimeString() : 'During Exam',
      'CRITICAL',
      'Unauthorized electronic device or mobile phone detected in examination area. Immediate trust reduction and flag recorded.'
    ]);
  }

  violations.forEach((v) => {
    const info = getViolationInfo(v.type);
    const timeStr = v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : 'Recorded';
    const num = String(formattedMistakes.length + 1);
    const description = info.description || 'Infraction of proctoring examination policy';

    formattedMistakes.push([
      num,
      info.title || v.type,
      timeStr,
      info.severity || 'HIGH',
      description
    ]);
  });

  if (formattedMistakes.length === 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Mistake Verification Status', 'Description & Findings']],
      body: [[
        'CLEAN EXAMINATION - ZERO (0) MISTAKES',
        'Student maintained 100% adherence to all proctoring guidelines. No camera deviations, secondary faces, audio speech, or unauthorized devices were logged.'
      ]],
      headStyles: {
        fillColor: successColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: darkTextColor
      },
      theme: 'grid',
      margin: { left: 14, right: 14 }
    });
  } else {
    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Mistake / Violation Type', 'Time', 'Severity', 'Detailed Description of Mistake']],
      body: formattedMistakes,
      headStyles: {
        fillColor: dangerColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 46, fontStyle: 'bold' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 82 }
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: darkTextColor
      },
      theme: 'grid',
      margin: { left: 14, right: 14 }
    });
  }

  currentY = ((doc as any).lastAutoTable?.finalY || 145) + 7;

  // EMBED DIRECT IMAGES: Render Captured Photo Evidence Directly in the PDF Document
  if (collectedSnapshots.length > 0) {
    // Check if new page is needed for photos
    if (currentY + 55 > 275) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(254, 242, 242); // Red-50
    doc.roundedRect(14, currentY, 182, 7.5, 2, 2, 'FD');
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dangerColor);
    doc.text(`CAPTURED PHOTO EVIDENCE & VIOLATION SNAPSHOTS (${collectedSnapshots.length} PROOF CAPTURES)`, 18, currentY + 5);

    currentY += 11;

    // Load and render each image directly in the document
    const imgWidth = 86;
    const imgHeight = 54;
    const gapX = 10;
    const leftMargin = 14;

    for (let i = 0; i < collectedSnapshots.length; i++) {
      const snap = collectedSnapshots[i];
      const col = i % 2;
      const xPos = leftMargin + col * (imgWidth + gapX);

      // Check if we need a new page before drawing this row
      if (col === 0 && currentY + imgHeight + 14 > 280) {
        doc.addPage();
        currentY = 20;
      }

      // Draw photo container box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(239, 68, 68);
      doc.setLineWidth(0.4);
      doc.roundedRect(xPos, currentY, imgWidth, imgHeight + 12, 2, 2, 'FD');

      // Attempt to embed actual image
      try {
        const loadedImg = await loadImageForPDF(snap.src);
        if (loadedImg) {
          doc.addImage(loadedImg.dataUrl, loadedImg.format, xPos + 1.5, currentY + 1.5, imgWidth - 3, imgHeight - 3);
        } else {
          doc.setFillColor(226, 232, 240);
          doc.rect(xPos + 1.5, currentY + 1.5, imgWidth - 3, imgHeight - 3, 'F');
          doc.setFontSize(7.5);
          doc.setTextColor(100, 116, 139);
          doc.text('Evidence Capture Rendered', xPos + (imgWidth / 2), currentY + (imgHeight / 2), { align: 'center' });
        }
      } catch (err) {
        console.warn('Failed embedding image in PDF:', err);
      }

      // Label below image
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...dangerColor);
      doc.text(snap.title.slice(0, 36), xPos + 3, currentY + imgHeight + 3.5);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(snap.subtitle.slice(0, 48), xPos + 3, currentY + imgHeight + 8);

      // Advance row if last column or end of array
      if (col === 1 || i === collectedSnapshots.length - 1) {
        currentY += imgHeight + 16;
      }
    }
  }

  // Question-by-Question Academic Answer Evaluation Table
  if (performance.questionResults.length > 0) {
    // If not enough room, start a fresh page
    if (currentY + 45 > 275) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkTextColor);
    doc.text('QUESTION-WISE ANSWER EVALUATION BREAKDOWN', 14, currentY);
    currentY += 4;

    const questionRows = performance.questionResults.map((qr, qIdx) => [
      `Q${qIdx + 1}`,
      qr.questionText.length > 48 ? `${qr.questionText.slice(0, 45)}...` : qr.questionText,
      qr.studentAnswerText || 'Unanswered',
      qr.correctAnswerText || 'N/A',
      `${qr.earnedPoints} / ${qr.maxPoints}`,
      qr.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Q#', 'Question Text', 'Student Answer', 'Correct Answer', 'Points', 'Status']],
      body: questionRows,
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40 },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }
      },
      bodyStyles: {
        fontSize: 7,
        textColor: darkTextColor
      },
      theme: 'grid',
      margin: { left: 14, right: 14 }
    });
  }

  // Footer on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`AI Proctor System &bull; Official Academic Audit Report &bull; Page ${i} of ${pageCount}`, 14, 290);
    doc.text(`Roll No: ${data.studentId || 'N/A'} &bull; Paper: ${data.subjectCode}`, 150, 290);
  }

  // Sanitize filename
  const cleanStudentName = (data.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanRollNo = (data.studentId || 'RollNo').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanSubjectCode = (data.subjectCode || 'SUBJECT').replace(/[^a-zA-Z0-9_-]/g, '_');
  
  doc.save(`${cleanSubjectCode}_${cleanRollNo}_${cleanStudentName}_Performance_Report.pdf`);
}

/**
 * Generate and download a comprehensive class-wide performance PDF report for the entire subject paper.
 * Formats all student mistakes cleanly in text format without requiring images.
 */
export function generateSubjectClassPerformancePDF(data: SubjectClassReportData) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor: [number, number, number] = [49, 46, 129]; // Indigo-900
  const accentColor: [number, number, number] = [79, 70, 229]; // Indigo-600
  const darkTextColor: [number, number, number] = [30, 41, 59]; // Slate-800
  const lightGray: [number, number, number] = [241, 245, 249]; // Slate-100

  const sub = data.subject;
  const questionsList = sub.questions || [];
  const totalExamQuestions = questionsList.length;

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 297, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(`SUBJECT PERFORMANCE & MISTAKES AUDIT REPORT: ${sub.name.toUpperCase()} (${sub.code})`, 14, 12);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Comprehensive Student Assessment & Proctoring Integrity Summary | Total Students Attended: ${data.students.length} | Generated: ${new Date().toLocaleString()}`, 14, 20);

  // Compute Summary Statistics
  let totalScoreSum = 0;
  let totalTrustSum = 0;
  let passCount = 0;

  const tableRows = data.students.map((st, index) => {
    const isDisqualified = !!(st.isDisqualified || st.isElectronicDevice);
    const perf = evaluateStudentSubmission(st.answers, questionsList, isDisqualified);
    const questionsAttended = perf.questionResults.filter(q => q.status !== 'unanswered').length;
    const trust = Math.max(0, st.trustScore ?? 100);

    totalScoreSum += perf.percentage;
    totalTrustSum += trust;
    if (perf.percentage >= 50 && !isDisqualified) passCount++;

    // Format all mistakes committed as readable, structured text
    const mistakes: string[] = [];
    if (st.isElectronicDevice) {
      mistakes.push('• Unauthorized Electronic Device / Mobile Flagged (Severe Violation)');
    }
    if (st.violationsList && st.violationsList.length > 0) {
      st.violationsList.forEach(v => {
        const info = getViolationInfo(v.type);
        const timeStr = v.timestamp ? ` [${new Date(v.timestamp).toLocaleTimeString()}]` : '';
        mistakes.push(`• ${info.title || v.type}${timeStr}: ${info.description || 'Infraction recorded'}`);
      });
    }

    const mistakesText = mistakes.length > 0 ? mistakes.join('\n') : 'Clean Exam (0 Mistakes Logged)';

    return [
      String(index + 1),
      st.studentName || 'Student',
      st.studentId || 'N/A',
      String(totalExamQuestions),
      String(questionsAttended),
      `${perf.earnedPoints} / ${perf.totalPoints} (${perf.percentage}%)`,
      `Grade ${perf.grade}`,
      `${trust}%`,
      mistakesText
    ];
  });

  const avgScore = data.students.length > 0 ? Math.round(totalScoreSum / data.students.length) : 0;
  const avgTrust = data.students.length > 0 ? Math.round(totalTrustSum / data.students.length) : 100;
  const passRate = data.students.length > 0 ? Math.round((passCount / data.students.length) * 100) : 0;

  // Overview Strip
  doc.setFillColor(...lightGray);
  doc.roundedRect(14, 31, 269, 13, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkTextColor);
  doc.text(`Class Summary:  Attended: ${data.students.length} Students   |   Avg Score: ${avgScore}%   |   Pass Rate: ${passRate}%   |   Avg Trust Score: ${avgTrust}%   |   Total Paper Marks: ${questionsList.reduce((acc, q) => acc + (q.points || 10), 0)} Pts`, 18, 39.5);

  // Table of All Students with text mistakes list
  autoTable(doc, {
    startY: 48,
    head: [[
      '#', 
      'Student Name', 
      'Roll No', 
      'Total Qs', 
      'Qs Attended', 
      'Total Marks Earned', 
      'Grade', 
      'Trust Score', 
      'Mistakes Committed List (Text Format)'
    ]],
    body: tableRows,
    headStyles: {
      fillColor: accentColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 36, fontStyle: 'bold' },
      2: { cellWidth: 26, fontStyle: 'bold' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      8: { cellWidth: 89, fontSize: 7 }
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: darkTextColor
    },
    theme: 'grid',
    margin: { left: 14, right: 14 }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Subject Examination Performance Report &bull; ${sub.name} (${sub.code}) &bull; Confidential &bull; Page ${i} of ${pageCount}`, 14, 202);
  }

  const cleanSubjectCode = (sub.code || 'SUBJECT').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${cleanSubjectCode}_Complete_Class_Performance_Report.pdf`);
}
