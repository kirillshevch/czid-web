import PropTypes from "prop-types";
import React from "react";

const IconAnnotationQuestion = ({ className }) => {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none">
      <path
        d="M9.08255 2H0.780954C0.573832 2 0.375194 2.0878 0.228736 2.24408C0.082279 2.40036 0 2.61232 0 2.83333V11.1667C0 11.3877 0.082279 11.5996 0.228736 11.7559C0.375194 11.9122 0.573832 12 0.780954 12H9.08255C9.26897 12 9.44925 11.9288 9.5908 11.7994L13.4546 8.26543C13.6256 8.10896 13.763 7.91485 13.8571 7.69643C13.9513 7.478 14 7.24043 14 7.00001C14 6.75959 13.9513 6.52201 13.8571 6.30359C13.763 6.08516 13.6256 5.89106 13.4546 5.73459L9.5908 2.20062C9.44925 2.07116 9.26897 2.00001 9.08255 2Z"
        fill="#3867FA"
      />
      <path
        d="M6.46909 9.04086C6.33212 8.90354 6.14287 8.82495 5.95013 8.82495C5.75661 8.82495 5.56701 8.90354 5.42978 9.04086C5.29342 9.17731 5.21509 9.36656 5.21509 9.55991C5.21509 9.75404 5.29333 9.94355 5.42978 10.08C5.56623 10.2165 5.75583 10.295 5.95013 10.295C6.14505 10.295 6.33456 10.2164 6.46839 10.081C6.60615 9.94468 6.68509 9.75473 6.68509 9.55999C6.68509 9.36595 6.60615 9.17653 6.46909 9.04086Z"
        fill="white"
      />
      <path
        d="M8.118 5.41123C8.07058 4.55783 7.23298 3.59249 6.04787 3.55749C4.86277 3.52248 4.06534 4.44403 3.92765 5.22408C3.92765 5.22408 3.91585 5.29026 3.90978 5.35528C3.9037 5.42029 3.91144 5.53985 3.92793 5.58881C3.94442 5.63777 4.1009 6.01438 4.54041 6.01438C4.7775 6.01438 4.93274 5.94908 4.99478 5.82333C5.04863 5.72983 5.08955 5.56917 5.11728 5.47333L5.11832 5.46973C5.14612 5.37355 5.19146 5.21672 5.37947 5.03583C5.54051 4.88088 5.7158 4.78818 5.93341 4.76433L6.00923 4.75817L6.08287 4.75622C6.68115 4.75622 6.80275 5.18499 6.80275 5.48249C6.80275 5.81785 6.37325 6.165 6.08287 6.4625C5.7925 6.76 5.49143 7.05668 5.34447 7.41584C5.1975 7.775 5.32 8.0025 5.39 8.0725C5.46 8.1425 5.59882 8.3175 5.91733 8.3175C6.23585 8.3175 6.4225 8.23 6.53755 8.11584C6.6526 8.00168 6.7375 7.705 7.0525 7.2675C7.3675 6.83 8.0553 6.15169 8.10977 5.66362L8.11722 5.57564L8.12 5.48443L8.118 5.41123Z"
        fill="white"
      />
    </svg>
  );
};

IconAnnotationQuestion.propTypes = {
  className: PropTypes.string,
};

export default IconAnnotationQuestion;