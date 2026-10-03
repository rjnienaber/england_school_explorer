#!/usr/bin/env bash

set -e

PERFORMANCE_ZIP=$1
OUTPUT_DB="/tmp/schools_performance.sqlite"

rm -f $OUTPUT_DB

for csv_file in `unzip -l $PERFORMANCE_ZIP | awk -F ' ' '{print $4}' | grep csv`;
do
  echo "$csv_file ";
  TABLE_NAME=`echo $csv_file | cut -d '/' -f 2 | tr -s '-' '_' | cut -d '.' -f 1`

  unzip -p $PERFORMANCE_ZIP $csv_file | sqlite3 -csv $OUTPUT_DB ".import '|cat -' $TABLE_NAME"
  echo
done

sqlite3 -header -csv $OUTPUT_DB "SELECT info.LANAME, info.SCHNAME, info.TOWN, info.POSTCODE, ek4f.EGENDER, ek4f.AGERANGE, ek4f.RELDENOM, ek4f.TOTPUPS, ek4f.ATT8SCR, ek4f.P8MEA, ek4f.EBACCAPS, ek4f.PTEBACC_E_PTQ_EE FROM england_school_information info LEFT JOIN england_ks4final ek4f on info.URN = ek4f.URN WHERE info.ISSECONDARY = 1 AND info.AGEHIGH = 18 AND info.SCHSTATUS = 'Open'" > tmp/schools_performance.csv