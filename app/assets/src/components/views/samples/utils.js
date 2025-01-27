import { get, isFinite } from "lodash/fp";
import { numberWithCommas, numberWithPlusOrMinus } from "~/helpers/strings";

const roundToTwo = number => {
  if (!isFinite(number)) return number;
  return number.toFixed(2);
};

const toPercent = number => {
  if (!isFinite(number)) return number;
  return `${roundToTwo(number)}%`;
};

export const getSampleTableData = sample => {
  const {
    derived_sample_output: derivedOutput,
    db_sample: dbSample,
    metadata,
  } = sample;

  const meanInsertSize = get("summary_stats.insert_size_mean", derivedOutput);
  const insertSizeStandardDeviation = get(
    "summary_stats.insert_size_standard_deviation",
    derivedOutput,
  );
  const meanInsertSizeString = numberWithPlusOrMinus(
    meanInsertSize,
    insertSizeStandardDeviation,
  );

  const data = {
    total_reads: numberWithCommas(
      get("pipeline_run.total_reads", derivedOutput),
    ),
    nonhost_reads: numberWithCommas(
      get("summary_stats.adjusted_remaining_reads", derivedOutput),
    ),
    nonhost_reads_percent: toPercent(
      get("summary_stats.percent_remaining", derivedOutput),
    ),
    total_ercc_reads: numberWithCommas(
      get("pipeline_run.total_ercc_reads", derivedOutput),
    ),
    fraction_subsampled: roundToTwo(
      get("pipeline_run.fraction_subsampled", derivedOutput),
    ),
    quality_control: toPercent(get("summary_stats.qc_percent", derivedOutput)),
    compression_ratio: roundToTwo(
      get("summary_stats.compression_ratio", derivedOutput),
    ),
    sample_type: get("sample_type", metadata),
    nucleotide_type: get("nucleotide_type", metadata),
    collection_location: get("collection_location", metadata),
    host_genome: get("host_genome_name", dbSample),
    notes: get("sample_notes", dbSample),
    insert_size_mean: meanInsertSizeString || "",
  };

  return data;
};
