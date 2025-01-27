import React from "react";
import ThresholdMap, {
  ThresholdConditions,
} from "~/components/utils/ThresholdMap";
import FilterTag from "~ui/controls/FilterTag";

interface ThresholdFilterTagProps {
  onClose: () => void;
  threshold: ThresholdConditions;
  className: string;
}

const ThresholdFilterTag = ({
  threshold,
  onClose,
  className,
}: ThresholdFilterTagProps) => {
  const text = `${threshold.metricDisplay} ${threshold.operator} ${threshold.value}`;

  if (ThresholdMap.isThresholdValid(threshold)) {
    return <FilterTag text={text} onClose={onClose} className={className} />;
  }
  return null;
};

export default ThresholdFilterTag;
