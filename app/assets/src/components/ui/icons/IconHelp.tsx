import React from "react";
import { IconProps } from "~/interface/icon";

const IconHelp = (props: IconProps) => {
  return (
    <svg
      className={props.className}
      width="32px"
      height="32px"
      viewBox="0 0 32 32"
      fillRule="evenodd"
      {...props}
    >
      <path
        d="M16.1126921,22.1091549 C16.6556089,22.1091549 17.188708,22.3305432 17.5745422,22.7173592 C17.9606218,23.0995117 18.1829919,23.6331018 18.1829919,24.1797002 C18.1829919,24.7282621 17.9606218,25.2633248 17.5725787,25.6471955 C17.1955804,26.0286117 16.6617449,26.25 16.1126921,26.25 C15.5653573,26.25 15.0312764,26.0291026 14.6469149,25.6444956 C14.2625534,25.2601341 14.0421468,24.7262986 14.0421468,24.1794547 C14.0421468,23.6348199 14.2627988,23.1017207 14.6469149,22.7173592 C15.0334854,22.3305432 15.5675663,22.1091549 16.1126921,22.1091549 Z M16.0803364,5.25 C19.6964754,5.25 22.752303,7.71021866 22.9145091,10.7333279 L22.9145091,10.7333279 L22.9213615,10.9926354 L22.9118565,11.3157297 L22.886361,11.6273844 C22.700044,13.3563463 21.7968644,14.4734427 19.8948807,15.9231194 L19.8948807,15.9231194 L19.6070583,16.1447383 L19.1059919,16.5473327 C18.1232685,17.3685346 17.7887072,17.8907053 17.6963313,18.7578689 L17.6963313,18.7578689 L17.6808359,19.7429577 L14.4967615,19.7429577 L14.5194061,18.5874676 C14.6978034,16.7068829 15.6877728,15.4650859 17.6474263,13.9714538 C19.3051157,12.7206165 19.7401565,12.173502 19.7401565,10.9855113 C19.7401565,9.26963569 18.1269167,7.91707746 16.0803364,7.91707746 L16.0803364,7.91707746 L15.8283986,7.92398382 L15.5690598,7.94579557 C13.9446808,8.13017853 12.6763205,9.18349863 12.4548333,10.5560528 L12.4548333,10.5560528 L12.4401278,10.6677924 L9.25,10.6677924 L9.26942679,10.4550308 L9.30642834,10.1943214 C9.77744012,7.43109247 12.6711184,5.25 16.0803364,5.25 Z"
        id="Icon"
      ></path>
    </svg>
  );
};

export default IconHelp;