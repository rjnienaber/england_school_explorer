import parse from 'csv-parse';
import stringify from 'csv-stringify'
import { promises as fs } from 'fs';
import { convertFromRaw, SchoolPerformance } from './school_performance'



async function main(): Promise<void> {
  try {
    const filename = process.argv[2];
    const outputFilename = process.argv[3];

    const contents = await fs.readFile(filename, 'utf-8');
    const records: SchoolPerformance[] = [];
    for await (const record of parse(contents, { columns: true, trim: true, onRecord: convertFromRaw })) {
      records.push(record);
    }

    console.dir(records[0])

    const output = await new Promise<string>((resolve, reject) => {
      stringify(records, { header: true},function(err, output){
        if (err) {
          reject(err)
        } else {
          resolve(output)
        }
      })
    })

    await fs.writeFile(outputFilename, output);
  } catch (e) {
    console.error(e);
  }
}

main()