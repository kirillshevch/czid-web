import React from "react";
import AllowedFeaturesProps from "~/interface/allowedFeatures";

const UserContextValues : AllowedFeaturesProps = {
  admin: false,
  firstSignIn: false,
  allowedFeatures: [],
  appConfig: {},
  userSettings: {},
};

export const UserContext = React.createContext(UserContextValues);
// Name to show in DevTools
UserContext.displayName = "UserContext";