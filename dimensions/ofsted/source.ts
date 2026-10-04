import type { SourceDef } from '../../lib/dimension.ts';
import { downloadFilteredCsv } from '../../lib/filter-csv.ts';

/** The Ofsted columns `parse.ts` reads. A column the parser starts to read is added here. */
const COLUMNS = [
  'URN', 'Web Link (opens in new window)', 'Safeguarding standards', 'Inclusion', 'Curriculum and teaching', 'Achievement',
  'Attendance and behaviour', 'Personal development and wellbeing', 'Post-16 provision (where applicable)', 'Leadership and governance',
  'Latest OEIF overall effectiveness', 'Latest OEIF quality of education', 'Latest OEIF behaviour and attitudes',
  'Latest OEIF personal development', 'Latest OEIF effectiveness of leadership and management',
  'Latest OEIF sixth form provision (where applicable)', 'Publication date of latest OEIF graded inspection', 'Publication date',
  'Most recent category of concern', 'Ungraded inspection overall outcome', 'Ungraded inspection publication date',
  'Does the latest full inspection relate to the URN of the current school?',
  'Does the latest OEIF graded inspection relate to the URN of the current school?',
  'Does the ungraded inspection relate to the URN of the current school?',
];

const OFSTED_PAGE_API =
  'https://www.gov.uk/api/content/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes';

interface Attachment {
  title?: string;
  url?: string;
}

// The Ofsted page lists one CSV per month, titled "... latest inspections as at 31 August 2026".
async function latestOfstedUrl(): Promise<{ title: string; url: string }> {
  const res = await fetch(OFSTED_PAGE_API);
  if (!res.ok) throw new Error(`GOV.UK content API returned ${res.status}`);
  const page = (await res.json()) as { details: { attachments: Attachment[] } };

  const candidates = page.details.attachments
    .filter((a) => a.url?.endsWith('.csv') && /state-funded schools - latest inspections as at/i.test(a.title ?? ''))
    .map((a) => {
      const date = new Date(a.title!.replace(/.*as at\s+/i, ''));
      return { title: a.title!, url: a.url!, date };
    })
    .filter((a) => !Number.isNaN(a.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (candidates.length === 0) throw new Error('No Ofsted "latest inspections" CSV found');
  return candidates[0];
}

export const sources: SourceDef[] = [
  {
    id: 'ofsted',
    describe: 'Ofsted monthly management information: state-funded schools, latest inspections',
    homepage: 'https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes',
    publisher: 'Ofsted',
    licence: 'OGL v3',
    updated: 'monthly',
    usedFor: 'Inspection outcomes',
    notes:
      'Windows-1252. Only the columns read are kept (17 MB downloaded, under 5 MB stored). The latest file is found through the GOV.UK content API. ' +
      "Doesn't cover independent schools (most are inspected by the ISI).",
    encoding: 'windows-1252',
    // The whole file is downloaded (it can't be filtered on the server), but only the columns read are stored.
    fetchTo: async (file) => {
      const { title, url } = await latestOfstedUrl();
      console.log(`  ${title}`);
      await downloadFilteredCsv(url, file, { columns: COLUMNS, encoding: 'windows-1252' });
      return url;
    },
  },
];
