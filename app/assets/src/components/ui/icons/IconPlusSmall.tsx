import React from "react";
import { IconProps } from "~/interface/icon";

const IconPlusSmall = ({ className }: IconProps) => {
  return (
    <svg className={className} width="14px" height="14px" viewBox="0 0 14 14">
      <path d="M7.875,1 L7.875,6.125 L13,6.125 L13,7.875 L7.875,7.875 L7.875,13 L6.125,13 L6.125,7.875 L1,7.875 L1,6.125 L6.125,6.125 L6.125,1 L7.875,1 Z"></path>
    </svg>
  );
};

export default IconPlusSmall;
