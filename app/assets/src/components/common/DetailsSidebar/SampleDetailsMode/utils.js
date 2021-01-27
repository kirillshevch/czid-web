import moment from "moment";
import { find, get, isUndefined, mapValues } from "lodash/fp";

import { WORKFLOWS } from "~/components/utils/workflows";
import { CG_WETLAB_OPTIONS } from "~/components/views/SampleUploadFlow/WorkflowSelector";
import { numberWithCommas, numberWithPlusOrMinus } from "~/helpers/strings";

// Compute display values for Pipeline Info from server response.
export const processPipelineInfo = additionalInfo => {
  const {
    pipeline_run: pipelineRun,
    summary_stats: summaryStats,
    wetlab_protocol: wetlabProtocol,
    workflow,
    workflow_run: workflowRunInfo,
  } = additionalInfo;

  let pipelineInfo = {};

  const BLANK_TEXT = "unknown";

  if (pipelineRun) {
    const totalErccReads = pipelineRun.total_ercc_reads
      ? numberWithCommas(pipelineRun.total_ercc_reads)
      : 0;

    const erccPercent =
      pipelineRun.total_ercc_reads && pipelineRun.total_reads
        ? ` (${(
            (100.0 * pipelineRun.total_ercc_reads) /
            pipelineRun.total_reads
          ).toFixed(2)}%)`
        : "";

    pipelineInfo.totalReads = {
      text: numberWithCommas(pipelineRun.total_reads),
    };
    pipelineInfo.totalErccReads = { text: `${totalErccReads}${erccPercent}` };
    if (pipelineRun.version.pipeline) {
      pipelineInfo.pipelineVersion = {
        text: `v${pipelineRun.version.pipeline}`,
        linkLabel: "View Pipeline Visualization",
        link: `/samples/${pipelineRun.sample_id}/pipeline_viz/${pipelineRun.version.pipeline}`,
      };
    }
    pipelineInfo.hostSubtracted = { text: pipelineRun.host_subtracted };
  }

  if (summaryStats) {
    const adjustedRemainingReads = summaryStats.adjusted_remaining_reads
      ? numberWithCommas(summaryStats.adjusted_remaining_reads)
      : BLANK_TEXT;

    const adjustedPercent = summaryStats.percent_remaining
      ? ` (${summaryStats.percent_remaining.toFixed(2)}%)`
      : "";

    const unmappedReads = summaryStats.unmapped_reads
      ? numberWithCommas(summaryStats.unmapped_reads)
      : BLANK_TEXT;

    const qcPercent = summaryStats.qc_percent
      ? `${summaryStats.qc_percent.toFixed(2)}%`
      : BLANK_TEXT;

    const compressionRatio = summaryStats.compression_ratio
      ? summaryStats.compression_ratio.toFixed(2)
      : BLANK_TEXT;

    pipelineInfo.nonhostReads = {
      text: `${adjustedRemainingReads}${adjustedPercent}`,
    };
    pipelineInfo.unmappedReads = { text: unmappedReads };
    pipelineInfo.qcPercent = { text: qcPercent };
    pipelineInfo.compressionRatio = { text: compressionRatio };
    pipelineInfo.lastProcessedAt = {
      text: moment(summaryStats.last_processed_at).format("YYYY-MM-DD"),
    };

    const meanInsertSize = numberWithPlusOrMinus(
      summaryStats.insert_size_mean,
      summaryStats.insert_size_standard_deviation
    );

    if (meanInsertSize) {
      pipelineInfo.meanInsertSize = { text: meanInsertSize };
    }
  }

  if (workflow) {
    pipelineInfo.workflow = {
      text: get("label", find({ value: workflow }, Object.values(WORKFLOWS))),
    };

    if (workflowRunInfo) {
      if (workflow === WORKFLOWS.CONSENSUS_GENOME.value) {
        const cgWorkflowRunInfo = processCGWorkflowRunInfo(workflowRunInfo);
        pipelineInfo = {
          ...pipelineInfo,
          ...mapValues(v => ({ text: v }), cgWorkflowRunInfo),
        };
      }
    }
  }

  if (wetlabProtocol) {
    pipelineInfo.wetlabProtocol = {
      // Get the friendly name
      text: get("text", find({ value: wetlabProtocol }, CG_WETLAB_OPTIONS)),
    };
  }

  return pipelineInfo;
};

const processCGWorkflowRunInfo = qualityMetrics => {
  const {
    ercc_mapped_reads: erccMappedReads,
    executed_at: lastProcessedAt,
    mapped_reads: mappedReads,
    total_reads: totalReads,
    wdl_version: pipelineVersion,
  } = qualityMetrics;

  return {
    erccMappedReads: isUndefined(erccMappedReads)
      ? ""
      : numberWithCommas(erccMappedReads),
    lastProcessedAt: moment(lastProcessedAt).format("YYYY-MM-DD"),
    hostSubtracted: "Human",
    mappedReads: isUndefined(mappedReads) ? "" : numberWithCommas(mappedReads),
    totalReads: isUndefined(totalReads) ? "" : numberWithCommas(totalReads),
    pipelineVersion,
  };
};

// Format the upload date.
export const processAdditionalInfo = additionalInfo => ({
  ...additionalInfo,
  upload_date: moment(additionalInfo.upload_date).format("YYYY-MM-DD"),
});
