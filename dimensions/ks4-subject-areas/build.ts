// Progress 8 split into its four elements (English, maths, EBacc subjects, other subjects) and value added
// in science, humanities and languages, each with a 95% confidence interval. Taken from the same year as
// the school's headline Progress 8 (2023/24 today: DfE did not publish Progress 8 for later years).
// Reads the KS4 file owned by ks4-headline.

import { defineDimension, type NumberField } from '../../lib/dimension.ts';
import { P8_ELEMENT_LABELS, P8_ELEMENTS, VA_AREAS, VA_LABELS, type P8Element, type VaArea } from './areas.ts';
import { loadSubjectAreas } from './parse.ts';

type ElementFields = Record<`p8${P8Element}${'' | 'Lower' | 'Upper'}`, NumberField>;
type VaFields = Record<`va${VaArea}${'' | 'Lower' | 'Upper' | 'Pupils'}`, NumberField>;

const number = (label: string, description?: string): NumberField => ({
  type: 'number',
  placement: 'detail',
  label,
  description,
  source: 'ks4',
  year: 'subjectAreasYear',
});

function elementFields(): ElementFields {
  const fields: Record<string, NumberField> = {};
  for (const e of P8_ELEMENTS) {
    const name = P8_ELEMENT_LABELS[e];
    fields[`p8${e}`] = number(`Progress 8, ${name}`, `Progress 8 points per pupil for the ${name.toLowerCase()} part of Progress 8: 0 is the national average, above 0 is better than pupils with the same starting point`);
    fields[`p8${e}Lower`] = number(`Progress 8, ${name}, lower 95% confidence limit`);
    fields[`p8${e}Upper`] = number(`Progress 8, ${name}, upper 95% confidence limit`);
  }
  return fields as ElementFields;
}

function vaFields(): VaFields {
  const fields: Record<string, NumberField> = {};
  for (const a of VA_AREAS) {
    const name = VA_LABELS[a];
    fields[`va${a}`] = number(`Value added, ${name}`, `Average value added per pupil entered for ${name.toLowerCase()} GCSEs: 0 is the national average, above 0 is better than pupils with the same starting point`);
    fields[`va${a}Lower`] = number(`Value added, ${name}, lower 95% confidence limit`);
    fields[`va${a}Upper`] = number(`Value added, ${name}, upper 95% confidence limit`);
    fields[`va${a}Pupils`] = number(`Pupils in the ${name.toLowerCase()} value-added figure`);
  }
  return fields as VaFields;
}

export const module = defineDimension({
  id: 'ks4-subject-areas',
  title: 'Progress 8 by subject area and value added (KS4)',
  dependsOn: ['gias-core', 'ks4-headline'],
  fields: {
    subjectAreasYear: {
      type: 'string',
      placement: 'detail',
      label: 'Subject-area results year',
      description: 'Same year as the school\'s Progress 8 score',
      source: 'ks4',
    },
    ...elementFields(),
    ...vaFields(),
  },

  async build(ctx) {
    const byUrn = await loadSubjectAreas(ctx.dataPath('ks4'));
    const headline = ctx.read('ks4-headline');

    const rows = [];
    for (const { urn } of ctx.schools.all) {
      const label = headline.get(urn)?.p8Year;
      if (typeof label !== 'string') continue;
      const y = byUrn.get(urn)?.get(label);
      if (!y) continue;

      const row: Record<string, unknown> = { urn, subjectAreasYear: label };
      let any = false;
      for (const e of P8_ELEMENTS) {
        const s = y.elements[e];
        // An element needs its interval to be shown, so a score without one is left out
        if (s.average === null || s.lower === null || s.upper === null) continue;
        row[`p8${e}`] = s.average;
        row[`p8${e}Lower`] = s.lower;
        row[`p8${e}Upper`] = s.upper;
        any = true;
      }
      for (const a of VA_AREAS) {
        const s = y.valueAdded[a];
        if (s.average === null || s.lower === null || s.upper === null) continue;
        row[`va${a}`] = s.average;
        row[`va${a}Lower`] = s.lower;
        row[`va${a}Upper`] = s.upper;
        row[`va${a}Pupils`] = s.pupils;
        any = true;
      }
      if (any) rows.push(row as { urn: number });
    }

    ctx.log(`${rows.length} schools with Progress 8 by subject area or value added`);
    return rows;
  },
});
