import { Notification } from "czifui";
import React from "react";
import { pluralize } from "~/components/utils/stringUtil";
import { WORKFLOW_LABELS } from "~/components/utils/workflows";

interface DeleteSuccessNotificationProps {
  onClose(): void;
  sampleCount: number;
  workflowLabel: WORKFLOW_LABELS;
}

const DeleteSuccessNotification = ({
  onClose,
  sampleCount,
  workflowLabel,
}: DeleteSuccessNotificationProps) => (
  <Notification
    intent="info"
    onClose={onClose}
    buttonText="dismiss"
    buttonOnClick={onClose}
    dismissDirection="right"
  >
    {sampleCount} {workflowLabel} {pluralize("run", sampleCount)}{" "}
    {pluralize("was", sampleCount)} successfully deleted.
  </Notification>
);

export { DeleteSuccessNotification };