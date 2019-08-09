import React from "react";
import {
  filter,
  some,
  map,
  sum,
  take,
  zipObject,
  times,
  constant,
  pick,
} from "lodash/fp";

import Modal from "~ui/containers/Modal";
import PropTypes from "~/components/utils/propTypes";
import { logAnalyticsEvent } from "~/api/analytics";
import { formatFileSize } from "~/components/utils/format";
import AlertIcon from "~ui/icons/AlertIcon";
import CheckmarkIcon from "~ui/icons/CheckmarkIcon";
import UploadIcon from "~ui/icons/UploadIcon";
import PrimaryButton from "~/components/ui/controls/buttons/PrimaryButton";
import {
  bulkUploadLocalWithMetadata,
  bulkUploadRemote,
  bulkUploadBasespace,
} from "~/api/upload";

import cs from "./upload_progress_modal.scss";

const BASESPACE_SAMPLE_FIELDS = [
  "name",
  "project_id",
  "host_genome_id",
  "basespace_access_token",
  "basespace_dataset_id",
];

const NUM_FAILED_SAMPLES_TO_DISPLAY = 3;

export default class UploadProgressModal extends React.Component {
  state = {
    // For local uploads.
    sampleUploadPercentages: {},
    sampleUploadStatuses: {},
    uploadComplete: false,
    // For remote and basespace uploads. Failures for local samples are stored in sampleUploadStatuses.
    failedSampleNames: [],
  };

  componentDidUpdate() {
    const { samples, onUploadComplete, uploadType } = this.props;
    const { uploadComplete, sampleUploadStatuses } = this.state;

    // For local uploads, check if all samples are completed whenever sampleUploadStatuses changes.
    if (
      uploadType === "local" &&
      !uploadComplete &&
      !this.someLocalSamplesInProgress()
    ) {
      onUploadComplete();

      this.setState({
        uploadComplete: true,
      });

      if (this.someLocalSamplesFailed()) {
        const failedSamples = filter(
          sample => sampleUploadStatuses[sample.name] === "error",
          samples
        );
        this.logUploadFailed(
          failedSamples.length,
          samples.length - failedSamples.length
        );
      } else {
        this.logUploadSucceeded(samples.length);
      }
    }
  }

  // Kick off the upload as soon as the modal is opened.
  componentDidMount() {
    const { uploadType } = this.props;

    if (uploadType === "local") {
      this.initiateUploadLocal();
    } else {
      this.initiateUpload();
    }
  }

  updateSampleUploadStatus = (sampleName, status) => {
    // Use function version of setState since this function can be called in rapid succession.
    this.setState(prevState => ({
      ...prevState,
      sampleUploadStatuses: {
        ...prevState.sampleUploadStatuses,
        [sampleName]: status,
      },
    }));
  };

  updateSampleUploadPercentage = (sampleName, percentage) => {
    // Use function version of setState since this function can be called in rapid succession.
    this.setState(prevState => ({
      ...prevState,
      sampleUploadPercentages: {
        ...prevState.sampleUploadPercentages,
        [sampleName]: percentage,
      },
    }));
  };

  initiateUploadLocal = () => {
    const { samples, metadata } = this.props;

    bulkUploadLocalWithMetadata({
      samples,
      metadata,
      callbacks: {
        onCreateSamplesError: (errors, erroredSampleNames) => {
          // eslint-disable-next-line no-console
          console.error("onCreateSamplesError:", errors);

          const uploadStatuses = zipObject(
            erroredSampleNames,
            times(constant("error"), erroredSampleNames.length)
          );

          this.setState(prevState => ({
            ...prevState,
            sampleUploadStatuses: {
              ...prevState.sampleUploadStatuses,
              ...uploadStatuses,
            },
          }));

          this.logUploadStepError("createSamples", erroredSampleNames.length);
        },
        onSampleUploadProgress: (sample, percentage) => {
          this.updateSampleUploadPercentage(sample.name, percentage);
        },
        onSampleUploadError: (sample, error) => {
          // TODO(mark): Send to Datadog once front-end Datadog integration is installed
          // Particularly important for this callback since we upload directly to S3 without going through idseq-web.
          // eslint-disable-next-line no-console
          console.error("onSampleUploadError:", sample.name, error);
          this.updateSampleUploadStatus(sample.name, "error");
          this.logUploadStepError("sampleUpload", 1);
        },
        onSampleUploadSuccess: sample => {
          this.updateSampleUploadStatus(sample.name, "success");
        },
        onMarkSampleUploadedError: sample => {
          // eslint-disable-next-line no-console
          console.error("onMarkSampleUploadedError:", sample.name);
          this.updateSampleUploadStatus(sample.name, "error");
          this.logUploadStepError("markSampleUploaded", 1);
        },
      },
    });
  };

  // Initiate upload for s3 and basespace samples.
  initiateUpload = async () => {
    const { onUploadComplete, uploadType, samples, metadata } = this.props;

    let bulkUploadFn = bulkUploadRemote;
    let bulkUploadFnName = "bulkUploadRemote";
    let samplesToUpload = samples;

    if (uploadType === "basespace") {
      bulkUploadFn = bulkUploadBasespace;
      bulkUploadFnName = "bulkUploadBasespace";
      samplesToUpload = map(pick(BASESPACE_SAMPLE_FIELDS), samplesToUpload);
    }

    let response;

    try {
      response = await bulkUploadFn({
        samples: samplesToUpload,
        metadata,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`${bulkUploadFnName} error:`, error);
      this.setState({
        uploadComplete: true,
        failedSampleNames: map("name", samples),
      });
      this.logUploadFailed(samples.length, 0);
      return;
    }

    this.setState({
      uploadComplete: true,
      failedSampleNames: response.errored_sample_names || [],
    });
    onUploadComplete();

    if (response.errors.length > 0) {
      this.logUploadFailed(
        response.errored_sample_names.length,
        response.sample_ids.length
      );
    } else {
      this.logUploadSucceeded(response.sample_ids.length);
    }
  };

  // Log an error in a particular step of the upload process.
  // Only applies to local uploads.
  logUploadStepError = (step, erroredSamples) => {
    const { uploadType } = this.props;
    logAnalyticsEvent("UploadProgressModal_upload-step_error", {
      erroredSamples,
      step,
      uploadType,
    });
  };

  logUploadFailed = (erroredSamples, createdSamples) => {
    const { uploadType } = this.props;
    logAnalyticsEvent("UploadProgressModal_upload_failed", {
      erroredSamples,
      createdSamples,
      uploadType,
    });
  };

  logUploadSucceeded = createdSamples => {
    const { uploadType } = this.props;
    logAnalyticsEvent("UploadProgressModal_upload_succeeded", {
      createdSamples,
      uploadType,
    });
  };

  getSampleUploadPercentage = sample => {
    return this.state.sampleUploadPercentages[sample.name];
  };

  getSampleTotalSize = sample => {
    return sum(map(file => file.size, sample.files));
  };

  someLocalSamplesInProgress = () => {
    const { samples } = this.props;
    const { sampleUploadStatuses } = this.state;
    return some(
      sample => sampleUploadStatuses[sample.name] === undefined,
      samples
    );
  };

  someLocalSamplesFailed = () => {
    const { samples } = this.props;
    const { sampleUploadStatuses } = this.state;
    return some(
      sample => sampleUploadStatuses[sample.name] === "error",
      samples
    );
  };

  renderSampleStatus = sample => {
    const { sampleUploadStatuses } = this.state;

    if (sampleUploadStatuses[sample.name] === "error") {
      return (
        <React.Fragment>
          <AlertIcon className={cs.alertIcon} />
          Upload failed
        </React.Fragment>
      );
    }

    if (sampleUploadStatuses[sample.name] === "success") {
      return (
        <React.Fragment>
          <CheckmarkIcon className={cs.checkmarkIcon} />
          Uploaded and sent to pipeline
        </React.Fragment>
      );
    }

    const uploadPercentage = this.getSampleUploadPercentage(sample);
    if (uploadPercentage === undefined) {
      return "Waiting to upload...";
    }

    const totalSize = this.getSampleTotalSize(sample);

    return `Uploaded ${formatFileSize(
      totalSize * uploadPercentage
    )} of ${formatFileSize(totalSize)}...`;
  };

  renderFailedSamplesTitle = () => (
    <React.Fragment>
      <div className={cs.titleWithIcon}>
        <AlertIcon className={cs.alertIcon} />
        Some samples failed to upload
      </div>
      <div className={cs.subtitle}>
        <a
          className={cs.helpLink}
          href="mailto:help@idseq.net"
          onClick={() =>
            logAnalyticsEvent("UploadProgressModal_contact-us-link_clicked")
          }
        >
          Contact us for help
        </a>
      </div>
    </React.Fragment>
  );

  renderTitle = () => {
    const { samples, project, uploadType } = this.props;
    const { uploadComplete, failedSampleNames } = this.state;

    if (uploadType === "remote" || uploadType === "basespace") {
      if (uploadComplete) {
        // If any samples failed.
        if (failedSampleNames.length > 0) {
          return this.renderFailedSamplesTitle();
          // If all samples succeeded.
        } else {
          return (
            <React.Fragment>
              <div className={cs.titleWithIcon}>
                <CheckmarkIcon className={cs.checkmarkIcon} />
                {samples.length} samples successfully created
              </div>
              <div className={cs.instructions}>
                Our servers have started uploading your sample files from{" "}
                {uploadType === "basespace" ? "Basespace" : "S3"}. After the
                upload is complete, your samples will automatically start
                processing.
              </div>
            </React.Fragment>
          );
        }
      }
      // While samples are still being created.
      return (
        <React.Fragment>
          <div className={cs.title}>
            Creating {samples.length} sample{samples.length !== 1 && "s"} in{" "}
            {project.name}
          </div>
          <div className={cs.subtitle}>Please stay on this page</div>
        </React.Fragment>
      );
    }

    // While local samples are being uploaded.
    if (this.someLocalSamplesInProgress()) {
      return (
        <React.Fragment>
          <div className={cs.title}>
            Uploading {samples.length} sample{samples.length !== 1 && "s"} to{" "}
            {project.name}
          </div>
          <div className={cs.subtitle}>
            Please stay on this page until your upload completes
          </div>
        </React.Fragment>
      );
    }

    // If any local samples failed.
    if (this.someLocalSamplesFailed()) {
      return this.renderFailedSamplesTitle();
    }

    // If all local samples succeeded.
    return (
      <div className={cs.titleWithIcon}>
        <CheckmarkIcon className={cs.checkmarkIcon} />
        All samples uploaded successfully
      </div>
    );
  };

  renderSampleLoadingBar = sample => {
    const uploadPercentage = this.getSampleUploadPercentage(sample);

    return (
      <div className={cs.loadingBarBackground}>
        <div
          className={cs.loadingBar}
          style={{ width: `${uploadPercentage * 100}%` }}
        />
      </div>
    );
  };

  renderViewProjectButton = () => {
    const { project } = this.props;
    const { uploadComplete } = this.state;
    if (!uploadComplete) {
      return null;
    }

    return (
      <a className={cs.link} href={`/home?project_id=${project.id}`}>
        <PrimaryButton
          text="Go to Project"
          rounded={false}
          onClick={() =>
            logAnalyticsEvent("UploadProgressModal_to-project-button_clicked", {
              projectId: project.id,
              projectName: project.name,
            })
          }
        />
      </a>
    );
  };

  render() {
    const { samples, uploadType } = this.props;
    const { failedSampleNames } = this.state;

    return (
      <Modal open tall narrow className={cs.uploadProgressModal}>
        <div className={cs.header}>
          <UploadIcon className={cs.uploadIcon} />
          {this.renderTitle()}
        </div>
        {uploadType === "local" && (
          <div className={cs.sampleList}>
            {samples.map(sample => (
              <div key={sample.name} className={cs.sample}>
                <div className={cs.sampleHeader}>
                  <div className={cs.sampleName}>{sample.name}</div>
                  <div className={cs.fill} />
                  <div className={cs.sampleStatus}>
                    {this.renderSampleStatus(sample)}
                  </div>
                </div>
                {this.renderSampleLoadingBar(sample)}
              </div>
            ))}
          </div>
        )}
        {failedSampleNames.length > 0 && (
          <div className={cs.failedSamples}>
            Failed samples:{" "}
            {take(NUM_FAILED_SAMPLES_TO_DISPLAY, failedSampleNames).join(", ")}
            {failedSampleNames.length > NUM_FAILED_SAMPLES_TO_DISPLAY && (
              <span>
                ,&nbsp;and{" "}
                {failedSampleNames.length - NUM_FAILED_SAMPLES_TO_DISPLAY} more.
              </span>
            )}
          </div>
        )}
        <div className={cs.footer}>{this.renderViewProjectButton()}</div>
      </Modal>
    );
  }
}

UploadProgressModal.propTypes = {
  samples: PropTypes.arrayOf(
    PropTypes.shape({
      host_genome_id: PropTypes.number,
      input_file_attributes: PropTypes.shape({
        name: PropTypes.string,
        source: PropTypes.string,
        source_type: PropTypes.string,
      }),
      name: PropTypes.string,
      project_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      status: PropTypes.string,
      // Basespace samples only.
      file_size: PropTypes.number,
      file_type: PropTypes.string,
      basespace_project_name: PropTypes.string,
      files: PropTypes.objectOf(PropTypes.instanceOf(File)),
    })
  ),
  metadata: PropTypes.objectOf(PropTypes.any),
  onUploadComplete: PropTypes.func.isRequired,
  uploadType: PropTypes.string.isRequired,
  project: PropTypes.Project,
};