import { get, isEmpty, size } from "lodash/fp";
import React, { useContext, useState } from "react";
import { saveVisualization } from "~/api";
import {
  ANALYTICS_EVENT_NAMES,
  withAnalytics,
  trackEvent,
} from "~/api/analytics";

import { UserContext } from "~/components/common/UserContext";

import {
  showAppcue,
  SAMPLE_VIEW_HEADER_MNGS_HELP_SIDEBAR,
  SAMPLE_VIEW_HEADER_CG_HELP_SIDEBAR,
} from "~/components/utils/appcues";

import { BULK_DELETION_FEATURE } from "~/components/utils/features";
import {
  WORKFLOWS,
  WORKFLOW_VALUES,
  findInWorkflows,
  isMngsWorkflow,
} from "~/components/utils/workflows";
import { getWorkflowRunZipLink } from "~/components/views/report/utils/download";
import { parseUrlParams } from "~/helpers/url";
import ReportMetadata from "~/interface/reportMetaData";
import Sample, { WorkflowRun } from "~/interface/sample";
import { CurrentTabSample } from "~/interface/sampleView";
import { PipelineRun } from "~/interface/shared";
import {
  DownloadButton,
  ErrorButton,
  HelpButton,
  SaveButton,
} from "~ui/controls/buttons";
import { openUrl } from "~utils/links";
import { TABS } from "../../constants";
import { ControlsTopRow } from "./ControlsTopRow";
import { DownloadDropdown } from "./DownloadDropdown";
import { OverflowMenu } from "./OverflowMenu";
import { ShareButtonPopUp } from "./ShareButtonPopUp";

import cs from "./sample_view_header_controls.scss";

interface SampleViewHeaderControlsProps {
  backgroundId?: number;
  currentRun: WorkflowRun | PipelineRun;
  currentTab: CurrentTabSample;
  deletable: boolean;
  editable: boolean;
  getDownloadReportTableWithAppliedFiltersLink?: () => string;
  hasAppliedFilters: boolean;
  onDeleteSample: () => void;
  onDetailsClick: () => void;
  onPipelineVersionChange: (newPipelineVersion: string) => void;
  onShareClick: () => void;
  onDeleteRunSuccess: () => void;
  pipelineVersions?: string[];
  reportMetadata: ReportMetadata;
  sample: Sample;
  snapshotShareId?: string;
  view: string;
}

export const SampleViewHeaderControls = ({
  backgroundId,
  currentRun,
  currentTab,
  deletable,
  editable,
  getDownloadReportTableWithAppliedFiltersLink,
  hasAppliedFilters,
  onDeleteSample,
  onDetailsClick,
  onPipelineVersionChange,
  onShareClick,
  reportMetadata,
  sample,
  view,
  onDeleteRunSuccess,
}: SampleViewHeaderControlsProps) => {
  const userContext = useContext(UserContext);
  const { allowedFeatures, admin: userIsAdmin } = userContext || {};
  const succeeded = get("status", currentRun) === "SUCCEEDED";
  const running = get("status", currentRun) === "RUNNING";
  const runIsLoaded = !isEmpty(reportMetadata);
  const hasBulkDeletion = allowedFeatures.includes(BULK_DELETION_FEATURE);

  const [showOverflowButton, setShowOverflowButton] = useState(false);

  const workflow: WORKFLOW_VALUES =
    WORKFLOWS[findInWorkflows(currentTab, "label")]?.value ||
    WORKFLOWS.SHORT_READ_MNGS.value;

  const getAllRunsPerWorkflow = () => {
    const runsByType =
      get("workflow_runs", sample) &&
      get("workflow_runs", sample).filter(run => run.workflow === workflow);
    return isMngsWorkflow(workflow) ? get("pipeline_runs", sample) : runsByType;
  };

  const onSaveClick = async () => {
    if (view) {
      const params = parseUrlParams();
      params.sampleIds = sample?.id;
      await saveVisualization(view, params);
    }
  };

  const onDownloadAll = (eventName: "amr" | "consensus-genome") => {
    openUrl(getWorkflowRunZipLink(currentRun.id));
    trackEvent(`SampleViewHeader_${eventName}-download-all-button_clicked`, {
      sampleId: sample?.id,
    });
  };

  const onSaveWithAnalytics = () => {
    withAnalytics(onSaveClick, "SampleView_save-button_clicked", {
      sampleId: sample?.id,
    });
  };

  const renderHelpButton = () => {
    // CG help button should only be shown if feature flag is on
    // unless the sample has 0 mNGS runs & exactly 1 CG run.
    const shouldHideConsensusGenomeHelpButton =
      !allowedFeatures.includes("cg_appcues_help_button") ||
      (sample &&
        isEmpty(sample?.pipeline_runs) &&
        size(sample?.workflow_runs) === 1);

    if (
      workflow === WORKFLOWS.AMR.value ||
      workflow === WORKFLOWS.LONG_READ_MNGS.value ||
      (workflow === WORKFLOWS.CONSENSUS_GENOME.value &&
        shouldHideConsensusGenomeHelpButton)
    ) {
      return;
    }

    // format appCueFlowId and anaylticsEventName based on workflow
    const appCueFlowId = {
      [WORKFLOWS.SHORT_READ_MNGS.value]: SAMPLE_VIEW_HEADER_MNGS_HELP_SIDEBAR,
      [WORKFLOWS.CONSENSUS_GENOME.value]: SAMPLE_VIEW_HEADER_CG_HELP_SIDEBAR,
    };

    const anaylticsEventName = {
      [WORKFLOWS.SHORT_READ_MNGS.value]:
        ANALYTICS_EVENT_NAMES.SAMPLE_VIEW_HEADER_MNGS_HELP_BUTTON_CLICKED,
      [WORKFLOWS.CONSENSUS_GENOME.value]:
        ANALYTICS_EVENT_NAMES.SAMPLE_VIEW_HEADER_CONSENSUS_GENOME_HELP_BUTTON_CLICKED,
    };

    return (
      runIsLoaded && (
        <HelpButton
          className={cs.controlElement}
          onClick={showAppcue({
            flowId: appCueFlowId[workflow],
            analyticEventName: anaylticsEventName[workflow],
          })}
        />
      )
    );
  };

  const renderDownloadDropdown = () => {
    return (
      runIsLoaded && (
        <DownloadDropdown
          className={cs.controlElement}
          backgroundId={backgroundId}
          currentTab={currentTab}
          getDownloadReportTableWithAppliedFiltersLink={
            getDownloadReportTableWithAppliedFiltersLink
          }
          hasAppliedFilters={hasAppliedFilters}
          pipelineRun={currentRun as PipelineRun}
          sample={sample}
          view={view}
        />
      )
    );
  };

  const renderShareButton = () => {
    switch (workflow) {
      case WORKFLOWS.LONG_READ_MNGS.value:
      case WORKFLOWS.SHORT_READ_MNGS.value:
        return runIsLoaded && <ShareButtonPopUp onShareClick={onShareClick} />;
      case WORKFLOWS.CONSENSUS_GENOME.value:
        return succeeded && <ShareButtonPopUp onShareClick={onShareClick} />;
      case WORKFLOWS.AMR.value:
        return null;
    }
  };

  const renderDeleteSampleButton = () => {
    return (
      <ErrorButton
        text="Delete Sample"
        onClick={onDeleteSample}
        className={cs.controlElement}
      />
    );
  };

  const renderSaveButton = () => {
    switch (workflow) {
      case WORKFLOWS.LONG_READ_MNGS.value:
      case WORKFLOWS.SHORT_READ_MNGS.value:
        return (
          userIsAdmin && (
            <SaveButton
              className={cs.controlElement}
              onClick={onSaveWithAnalytics}
            />
          )
        );
      default:
        return null;
    }
  };
  const renderDownloadAll = (workflow: "amr" | "consensus-genome") => {
    return (
      succeeded && (
        <DownloadButton
          className={cs.controlElement}
          text="Download All"
          onClick={() => onDownloadAll(workflow)}
          primary={workflow === WORKFLOWS.AMR.value}
        />
      )
    );
  };

  const renderDownloadButton = () => {
    switch (workflow) {
      case WORKFLOWS.LONG_READ_MNGS.value:
      case WORKFLOWS.SHORT_READ_MNGS.value:
        if (!!reportMetadata.reportReady && currentRun) {
          return renderDownloadDropdown();
        } else if (!isEmpty(reportMetadata) && editable && deletable) {
          return renderDeleteSampleButton();
        }
        break;
      case WORKFLOWS.CONSENSUS_GENOME.value:
        if (succeeded) {
          return renderDownloadAll(workflow);
        } else if (
          editable &&
          deletable &&
          isEmpty(sample?.pipeline_runs) // if there are no mNGS runs
        ) {
          return renderDeleteSampleButton();
        }
        break;
      case WORKFLOWS.AMR.value:
        if (succeeded) {
          return renderDownloadAll(workflow);
        }
        break;
    }
  };

  const renderDownloadButtonUpdated = () => {
    // created `renderDownloadButtonUpdated` to change the logic of the delete sample button behind the feature flag
    // this will eventually replace renderDownloadButton for all users

    const remainingWorkflowRuns =
      !isMngsWorkflow(workflow) &&
      sample?.workflow_runs?.filter(run => run.id !== currentRun?.id);

    switch (workflow) {
      case WORKFLOWS.LONG_READ_MNGS.value:
      case WORKFLOWS.SHORT_READ_MNGS.value:
        if (!!reportMetadata.reportReady && currentRun) {
          !showOverflowButton && setShowOverflowButton(true);
          return renderDownloadDropdown();
        } else if (!isEmpty(reportMetadata) && editable && deletable) {
          showOverflowButton && setShowOverflowButton(false);
          return renderDeleteSampleButton();
        }
        break;
      case WORKFLOWS.CONSENSUS_GENOME.value:
      case WORKFLOWS.AMR.value:
        if (succeeded) {
          !showOverflowButton && setShowOverflowButton(true);
          return renderDownloadAll(workflow);
        } else if (
          editable &&
          deletable &&
          isEmpty(sample?.pipeline_runs) && // if there are no mNGS runs
          remainingWorkflowRuns.length === 0 // if there are no other workflow runs
        ) {
          showOverflowButton && setShowOverflowButton(false);
          return renderDeleteSampleButton();
        }
        break;
    }
  };

  const renderOverflowMenu = () => {
    const redirectOnSuccess =
      sample && [...sample.pipeline_runs, ...sample.workflow_runs].length === 1;
    return (
      hasBulkDeletion &&
      showOverflowButton &&
      currentTab !== TABS.AMR_DEPRECATED && (
        <OverflowMenu
          className={cs.controlElement}
          workflow={workflow}
          deleteId={isMngsWorkflow(workflow) ? sample?.id : currentRun?.id}
          onDeleteRunSuccess={onDeleteRunSuccess}
          deleteDisabled={!(editable && deletable) || running}
          redirectOnSuccess={redirectOnSuccess}
        />
      )
    );
  };

  return (
    <>
      <div className={cs.controlsTopRowContainer}>
        <ControlsTopRow
          sample={sample}
          currentRun={currentRun}
          getAllRuns={getAllRunsPerWorkflow}
          workflow={workflow}
          onPipelineVersionChange={onPipelineVersionChange}
          userIsAdmin={userIsAdmin}
          onDetailsClick={onDetailsClick}
        />
      </div>
      <div className={cs.controlsBottomRowContainer}>
        {renderShareButton()}
        {renderSaveButton()}
        {!hasBulkDeletion
          ? renderDownloadButton()
          : renderDownloadButtonUpdated()}
        {renderHelpButton()}
        {renderOverflowMenu()}
      </div>
    </>
  );
};
