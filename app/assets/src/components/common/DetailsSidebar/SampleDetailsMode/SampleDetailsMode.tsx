import { some } from "lodash";
import { get, isEmpty, find, size, set } from "lodash/fp";
import React, { useEffect, useState } from "react";

import { saveSampleName, saveSampleNotes, getAllSampleTypes } from "~/api";
import { trackEvent } from "~/api/analytics";
import {
  getSampleMetadata,
  saveSampleMetadata,
  getSampleMetadataFields,
} from "~/api/metadata";
import Tabs from "~/components/ui/controls/Tabs";
import {
  generateUrlToSampleView,
  TempSelectedOptionsShape,
} from "~/components/utils/urls";
import { WORKFLOWS } from "~/components/utils/workflows";
import ConsensusGenomeDropdown from "~/components/views/SampleView/ConsensusGenomeDropdown";
import { TABS as WORKFLOW_TABS } from "~/components/views/SampleView/constants";
import Sample, { WorkflowRun } from "~/interface/sample";
import {
  PipelineRun,
  SnapshotShareId,
  SummaryStats,
  MetadataTypes,
  LocationObject,
} from "~/interface/shared";
import {
  processMetadata,
  processMetadataTypes,
  Metadata,
} from "~utils/metadata";
import MetadataTab from "./MetadataTab";
import NotesTab from "./NotesTab";
import PipelineTab, { MngsPipelineInfo, PipelineInfo } from "./PipelineTab";

import cs from "./sample_details_mode.scss";
import {
  processPipelineInfo,
  processAdditionalInfo,
  processCGWorkflowRunInfo,
  processAMRWorkflowRun,
} from "./utils";

export interface SampleDetailsModeProps {
  currentRun: Record<string, string | number | null> | WorkflowRun;
  currentWorkflowTab: string;
  handleWorkflowTabChange: $TSFixMeFunction;
  sample: Sample;
  sampleId: number;
  pipelineVersion: string; // Needs to be string for 3.1 vs. 3.10.
  onMetadataUpdate: $TSFixMeFunction;
  onWorkflowRunSelect: $TSFixMeFunction;
  sampleWorkflowLabels: string[];
  showReportLink: boolean;
  snapshotShareId: SnapshotShareId;
  tempSelectedOptions: TempSelectedOptionsShape;
}

export interface AdditionalInfo {
  name: string;
  project_id: number;
  project_name: string;
  upload_date?: string;
  host_genome_name?: string;
  host_genome_taxa_category?: string;
  editable?: boolean;
  notes?: string | null;
  ercc_comparison: { name: string; actual: number; expected: number }[];
  summary_stats?: SummaryStats;
  pipeline_run?: PipelineRun;
}

type TabNames = "Metadata" | "Pipelines" | "Notes";
const TABS: TabNames[] = ["Metadata", "Pipelines", "Notes"];

const SampleDetailsMode = ({
  currentRun,
  currentWorkflowTab,
  handleWorkflowTabChange,
  sample,
  sampleId,
  onMetadataUpdate,
  onWorkflowRunSelect,
  showReportLink,
  snapshotShareId,
  tempSelectedOptions,
  sampleWorkflowLabels,
}: SampleDetailsModeProps) => {
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo | null>(
    null,
  );
  const [currentTab, setCurrentTab] = useState(TABS[0]);
  const [lastValidMetadata, setLastValidMetadata] = useState<Metadata | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [metadataChanged, setMetadataChanged] = useState<
    Record<string, boolean>
  >({});
  const [metadataErrors, setMetadataErrors] = useState<
    Record<string, string | null>
  >({});
  const [metadataSavePending, setMetadataSavePending] = useState<
    Record<string, boolean>
  >({});
  const [metadataTypes, setMetadataTypes] = useState<MetadataTypes | null>(
    null,
  );
  const [pipelineInfo, setPipelineInfo] = useState<MngsPipelineInfo | null>(
    null,
  );
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [sampleTypes, setSampleTypes] = useState(null);
  const [singleKeyValueToSave, setSingleKeyValueToSave] = useState<
    [string, string | number | LocationObject] | null
  >(null);

  useEffect(() => {
    if (sampleId) fetchMetadata();
  }, [sampleId]);

  useEffect(() => {
    // _save relies on this.state.metadata being up-to-date
    if (singleKeyValueToSave) {
      const [key, value] = singleKeyValueToSave;
      _save(sampleId, key, value);
      setSingleKeyValueToSave(null);
    }
  }, [metadata]);

  const onTabChange = (tab: TabNames) => {
    setCurrentTab(tab);
    trackEvent("SampleDetailsMode_tab_changed", {
      sampleId,
      tab,
    });
  };

  const fetchMetadata = async () => {
    setLoading(true);
    setMetadata(null);
    setAdditionalInfo(null);
    setPipelineInfo(null);

    if (!sampleId) {
      return;
    }

    const [
      fetchedMetadata,
      fetchedMetadataTypes,
      fetchedSampleTypes,
    ] = await Promise.all([
      getSampleMetadata({
        id: sampleId,
        pipelineVersion: get("pipeline_version", currentRun),
        snapshotShareId,
      }),
      getSampleMetadataFields(sampleId, snapshotShareId),
      !snapshotShareId && getAllSampleTypes(),
    ]);

    const processedMetadata = processMetadata({
      metadata: fetchedMetadata.metadata,
      flatten: true,
    });

    setMetadata(processedMetadata);
    setLastValidMetadata(processedMetadata);
    setAdditionalInfo(processAdditionalInfo(fetchedMetadata.additional_info));
    setPipelineInfo(processPipelineInfo(fetchedMetadata.additional_info));
    setPipelineRun(fetchedMetadata.additional_info.pipeline_run);
    setMetadataTypes(
      fetchedMetadataTypes
        ? processMetadataTypes(fetchedMetadataTypes)
        : metadataTypes,
    );
    setSampleTypes(fetchedSampleTypes);
    setLoading(false);
  };

  // shouldSave option is used when <Input> option is selected
  // to change and save in one call (to avoid setState issues)
  const handleMetadataChange = (
    key: string,
    value: string | number | LocationObject,
    shouldSave?: boolean,
  ) => {
    /* Sample name and note are special cases */
    if (key === "name" || key === "notes") {
      setAdditionalInfo(set(key, value, additionalInfo));
      setMetadataChanged(set(key, true, metadataChanged));
      return;
    }
    if (shouldSave) {
      setSingleKeyValueToSave([key, value]);
    }
    setMetadata(set(key, value, metadata));
    setMetadataChanged(set(key, !shouldSave, metadataChanged));
    setMetadataErrors(set(key, null, metadataErrors));

    trackEvent("SampleDetailsMode_metadata_changed", {
      sampleId,
      key,
      shouldSave,
      metadataErrors: Object.keys(metadataErrors).length,
    });
  };

  const handleMetadataSave = async (key: string) => {
    if (metadataChanged[key]) {
      const newValue =
        key === "name" || key === "notes" ? additionalInfo[key] : metadata[key];

      setMetadataChanged(set(key, false, metadataChanged));
      _save(sampleId, key, newValue);

      trackEvent("SampleDetailsMode_metadata_saved", {
        sampleId,
        key,
      });
    }
  };

  const _save = async (
    id: number,
    key: string,
    value: string | number | LocationObject,
  ) => {
    let _lastValidMetadata = lastValidMetadata;
    let _metadataErrors = metadataErrors;
    let _metadata = metadata;

    // When metadata is saved, fire event.
    if (onMetadataUpdate) {
      onMetadataUpdate(key, value);
    }

    setMetadataSavePending(set(key, true, metadataSavePending));
    if (key === "name") {
      await saveSampleName(id, value);
    } else if (key === "notes") {
      await saveSampleNotes(id, value);
    } else {
      await saveSampleMetadata(sampleId, key, value).then(response => {
        // If the save fails, immediately revert to the last valid metadata value.
        if (response.status === "failed") {
          _metadataErrors = set(key, response.message, _metadataErrors);
          _metadata = set(key, _lastValidMetadata[key], _metadata);
        } else {
          _lastValidMetadata = set(key, value, _lastValidMetadata);
        }
      });
    }

    setMetadataSavePending(set(key, false, metadataSavePending));
    setMetadataErrors(_metadataErrors);
    setMetadata(_metadata);
    setLastValidMetadata(_lastValidMetadata);
  };

  const renderTab = () => {
    const savePending = some(metadataSavePending);

    if (currentTab === "Metadata") {
      return (
        <MetadataTab
          metadata={metadata}
          additionalInfo={additionalInfo}
          metadataTypes={metadataTypes}
          onMetadataChange={handleMetadataChange}
          onMetadataSave={handleMetadataSave}
          savePending={savePending}
          metadataErrors={metadataErrors}
          sampleTypes={sampleTypes || []}
          snapshotShareId={snapshotShareId}
        />
      );
    }
    if (currentTab === "Pipelines") {
      const workflowTabs = size(sampleWorkflowLabels) > 1 && (
        <Tabs
          className={cs.workflowTabs}
          tabStyling={cs.tabLabels}
          tabs={sampleWorkflowLabels}
          value={currentWorkflowTab}
          onChange={handleWorkflowTabChange}
          hideBorder
        />
      );

      const consensusGenomeWorkflowRuns =
        sample &&
        sample.workflow_runs.filter(
          run => run.workflow === WORKFLOWS.CONSENSUS_GENOME.value,
        );

      const consensusGenomeDropdown = currentWorkflowTab ===
        WORKFLOW_TABS.CONSENSUS_GENOME &&
        size(consensusGenomeWorkflowRuns) > 1 && (
          <div className={cs.dropdownContainer}>
            <ConsensusGenomeDropdown
              workflowRuns={consensusGenomeWorkflowRuns}
              initialSelectedValue={currentRun.id}
              onConsensusGenomeSelection={workflowRunId =>
                onWorkflowRunSelect(
                  find({ id: workflowRunId }, consensusGenomeWorkflowRuns),
                )
              }
            />
          </div>
        );

      let pipelineInfoForTab: PipelineInfo = pipelineInfo;
      if (currentWorkflowTab === WORKFLOW_TABS.CONSENSUS_GENOME) {
        pipelineInfoForTab = processCGWorkflowRunInfo(currentRun);
      } else if (currentWorkflowTab === WORKFLOW_TABS.AMR) {
        pipelineInfoForTab = processAMRWorkflowRun(currentRun as WorkflowRun);
      }

      return (
        <>
          {workflowTabs}
          {consensusGenomeDropdown}
          <PipelineTab
            pipelineInfo={pipelineInfoForTab}
            erccComparison={additionalInfo.ercc_comparison}
            pipelineRun={pipelineRun}
            sampleId={sampleId}
            snapshotShareId={snapshotShareId}
          />
        </>
      );
    }
    if (currentTab === "Notes") {
      return (
        <NotesTab
          notes={additionalInfo.notes}
          editable={additionalInfo.editable}
          onNoteChange={val => handleMetadataChange("notes", val)}
          onNoteSave={() => handleMetadataSave("notes")}
          savePending={savePending}
        />
      );
    }
    return null;
  };

  return (
    <div className={cs.content}>
      {loading ? (
        <div className={cs.loadingMsg}>Loading...</div>
      ) : (
        <div className={cs.title}>{additionalInfo.name}</div>
      )}
      {!loading && showReportLink && (
        <div className={cs.reportLink}>
          <a
            href={generateUrlToSampleView({
              sampleId,
              tempSelectedOptions,
            })}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() =>
              trackEvent("SampleDetailsMode_see-report-link_clicked", {
                withTempSelectedOptions: !isEmpty(tempSelectedOptions),
              })
            }
          >
            See Report
          </a>
        </div>
      )}
      {!loading && (
        <Tabs
          className={cs.tabs}
          tabs={TABS}
          value={currentTab}
          onChange={onTabChange}
        />
      )}
      {!loading && renderTab()}
    </div>
  );
};

export default SampleDetailsMode;
