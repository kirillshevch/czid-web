import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import PrimaryButton from "~/components/ui/controls/buttons/PrimaryButton";
import { createBulkDownload } from "~/api/bulk_downloads";
import Notification from "~ui/notifications/Notification";
import LoadingMessage from "~/components/common/LoadingMessage";
import { openUrl } from "~utils/links";

import BulkDownloadSummary from "./BulkDownloadSummary";
import cs from "./review_step.scss";

class ReviewStep extends React.Component {
  state = {
    // Whether we are waiting for the createBulkDownload call to complete.
    waitingForCreate: false,
    createStatus: null,
    createError: "",
  };

  createBulkDownload = async () => {
    const { selectedDownload } = this.props;
    this.setState({
      waitingForCreate: true,
    });

    try {
      await createBulkDownload(selectedDownload);
    } catch (e) {
      this.setState({
        waitingForCreate: false,
        createStatus: "error",
        createError: e.error,
      });
      return;
    }

    openUrl("/bulk_downloads");
  };

  backLinkEnabled = () =>
    !this.state.waitingForCreate && this.state.createStatus === null;

  renderFooter = () => {
    const { waitingForCreate, createStatus, createError } = this.state;

    if (waitingForCreate) {
      return <LoadingMessage message="Starting your download..." />;
    }

    if (createStatus === "error") {
      return <Notification type="error">{createError}</Notification>;
    }

    return (
      <React.Fragment>
        <PrimaryButton
          text="Start Generating Download"
          onClick={this.createBulkDownload}
        />
        <div className={cs.downloadDisclaimer}>
          Downloads for larger files can take multiple hours to generate.
        </div>
      </React.Fragment>
    );
  };

  getDownloadSummary = selectedDownload => ({
    params: selectedDownload.fields,
    numSamples: selectedDownload.sampleIds.length,
  });

  render() {
    const { selectedDownload, downloadType, onBackClick } = this.props;

    return (
      <div className={cs.reviewStep}>
        <div className={cs.header}>
          <div className={cs.title}>Review Your Download</div>
          <div
            className={cx(cs.editLink, this.backLinkEnabled() && cs.enabled)}
            onClick={this.backLinkEnabled() ? onBackClick : undefined}
          >
            Edit download
          </div>
        </div>
        <BulkDownloadSummary
          className={cs.selectedDownload}
          downloadSummary={this.getDownloadSummary(selectedDownload)}
          downloadType={downloadType}
        />
        <div className={cs.footer}>{this.renderFooter()}</div>
      </div>
    );
  }
}

ReviewStep.propTypes = {
  selectedDownload: PropTypes.shape({
    downloadType: PropTypes.string.isRequired,
    fields: PropTypes.object,
    sampleIds: PropTypes.arrayOf(PropTypes.number).isRequired,
  }).isRequired,
  downloadType: PropTypes.shape({
    type: PropTypes.string,
    display_name: PropTypes.string,
    description: PropTypes.string,
    category: PropTypes.string,
    fields: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
        display_name: PropTypes.string,
      })
    ),
  }),
  onBackClick: PropTypes.func.isRequired,
};

export default ReviewStep;