import {
  OEIF_GRADES,
  REPORT_CARD_GRADES,
  type OeifGrade,
  type OfstedSummary,
  type ReportCardGrade,
} from './grades.ts';
import { num, readCsv, text } from '../../lib/csv.ts';

export interface OfstedRecord {
  url: string | null;
  framework: 'report-card' | 'oeif' | 'ungraded' | null;
  date: string | null;
  predecessor: boolean;
  summary: OfstedSummary | null;
  rc: {
    safeguarding: string | null;
    inclusion: ReportCardGrade | null;
    curriculum: ReportCardGrade | null;
    achievement: ReportCardGrade | null;
    attendance: ReportCardGrade | null;
    personalDevelopment: ReportCardGrade | null;
    post16: ReportCardGrade | null;
    leadership: ReportCardGrade | null;
  };
  oeif: {
    overall: OeifGrade | null;
    quality: OeifGrade | null;
    behaviour: OeifGrade | null;
    personalDevelopment: OeifGrade | null;
    leadership: OeifGrade | null;
    sixthForm: OeifGrade | null;
    date: string | null;
  };
  ungradedOutcome: string | null;
  ungradedDate: string | null;
}

/** "31/08/2026" → "2026-08-31" */
function isoDate(value: string | undefined): string | null {
  const m = text(value)?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function reportCardGrade(value: string | undefined): ReportCardGrade | null {
  const v = text(value);
  return REPORT_CARD_GRADES.find((g) => g === v) ?? null;
}

// "Not judged" (no overall grade after Sept 2024) and 9 (not applicable) both become null
function oeifGrade(value: string | undefined): OeifGrade | null {
  const n = num(value);
  return n !== null && n in OEIF_GRADES ? (n as OeifGrade) : null;
}

function summariseReportCard(rc: OfstedRecord['rc']): OfstedSummary {
  const grades = [rc.inclusion, rc.curriculum, rc.achievement, rc.attendance, rc.personalDevelopment, rc.post16, rc.leadership].filter(
    (g) => g !== null,
  );
  if (rc.safeguarding === 'Not met' || grades.includes('Urgent improvement')) return 'serious';
  if (grades.includes('Needs attention')) return 'concern';
  const strong = grades.filter((g) => g === 'Exceptional' || g === 'Strong standard').length;
  return strong * 2 >= grades.length ? 'top' : 'good';
}

const OEIF_SUMMARY: Record<OeifGrade, OfstedSummary> = { 1: 'top', 2: 'good', 3: 'concern', 4: 'serious' };

// Short (section 8) inspections confirm the previous grade. Only these outcomes imply one;
// "Standards maintained" etc. (from Sept 2024) don't.
function summariseUngraded(outcome: string | null): OfstedSummary | null {
  if (outcome?.startsWith('School remains Outstanding')) return 'top';
  if (outcome?.startsWith('School remains Good')) return 'good';
  return null;
}

/**
 * Reads Ofsted's monthly "state-funded schools - latest inspections" file. A school may
 * have a report card (renewed framework, from 10 Nov 2025), an older OEIF graded
 * inspection, or both; the report card wins when present. The file is Windows-1252 encoded.
 */
export async function loadOfsted(file: string): Promise<Map<number, OfstedRecord>> {
  const records = new Map<number, OfstedRecord>();

  for await (const row of readCsv(file, 'windows-1252')) {
    const urn = num(row.URN);
    if (urn === null) continue;

    const rc: OfstedRecord['rc'] = {
      safeguarding: text(row['Safeguarding standards']),
      inclusion: reportCardGrade(row['Inclusion']),
      curriculum: reportCardGrade(row['Curriculum and teaching']),
      achievement: reportCardGrade(row['Achievement']),
      attendance: reportCardGrade(row['Attendance and behaviour']),
      personalDevelopment: reportCardGrade(row['Personal development and wellbeing']),
      post16: reportCardGrade(row['Post-16 provision (where applicable)']),
      leadership: reportCardGrade(row['Leadership and governance']),
    };

    const oeif: OfstedRecord['oeif'] = {
      overall: oeifGrade(row['Latest OEIF overall effectiveness']),
      quality: oeifGrade(row['Latest OEIF quality of education']),
      behaviour: oeifGrade(row['Latest OEIF behaviour and attitudes']),
      personalDevelopment: oeifGrade(row['Latest OEIF personal development']),
      leadership: oeifGrade(row['Latest OEIF effectiveness of leadership and management']),
      sixthForm: oeifGrade(row['Latest OEIF sixth form provision (where applicable)']),
      date: isoDate(row['Publication date of latest OEIF graded inspection']),
    };

    const hasReportCard = rc.curriculum !== null || rc.achievement !== null || rc.safeguarding !== null;
    const hasOeif = oeif.overall !== null || oeif.quality !== null;
    const oeifSummaryGrade = oeif.overall ?? oeif.quality;
    // Special measures, serious weaknesses and (renewed framework) requires significant
    // improvement override the grade summary
    const concernCategory = text(row['Most recent category of concern']);

    const ungradedOutcome = text(row['Ungraded inspection overall outcome']);
    const ungradedDate = isoDate(row['Ungraded inspection publication date']);

    let summary: OfstedSummary | null = null;
    if (hasReportCard) summary = summariseReportCard(rc);
    else if (oeifSummaryGrade !== null) summary = OEIF_SUMMARY[oeifSummaryGrade];
    else summary = summariseUngraded(ungradedOutcome);
    if (concernCategory === 'SM' || concernCategory === 'SWK' || concernCategory === 'RSI') summary = 'serious';

    const framework = hasReportCard ? 'report-card' : hasOeif ? 'oeif' : ungradedOutcome ? 'ungraded' : null;
    const predecessorFlag =
      framework === 'report-card'
        ? row['Does the latest full inspection relate to the URN of the current school?']
        : framework === 'oeif'
          ? row['Does the latest OEIF graded inspection relate to the URN of the current school?']
          : row['Does the ungraded inspection relate to the URN of the current school?'];
    const date = framework === 'report-card' ? isoDate(row['Publication date']) : framework === 'oeif' ? oeif.date : ungradedDate;

    records.set(urn, {
      url: text(row['Web Link (opens in new window)']),
      framework,
      date,
      predecessor: predecessorFlag === 'No',
      summary,
      rc,
      oeif,
      ungradedOutcome,
      ungradedDate,
    });
  }

  return records;
}
