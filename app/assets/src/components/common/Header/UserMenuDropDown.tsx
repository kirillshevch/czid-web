import React from "react";
import { trackEvent, withAnalytics } from "~/api/analytics";
import BareDropdown from "~ui/controls/dropdowns/BareDropdown";
import { postToUrlWithCSRF } from "~utils/links";
import ExternalLink from "../../ui/controls/ExternalLink";
import cs from "./header.scss";

interface UserMenuDropDownProps {
  adminUser?: boolean;
  email: string;
  signOutEndpoint: string;
  userName: string;
}

const UserMenuDropDown = ({
  adminUser,
  email,
  signOutEndpoint,
  userName,
}: UserMenuDropDownProps) => {
  const signOut = () => {
    sessionStorage.clear();
    postToUrlWithCSRF(signOutEndpoint);
  };

  const renderItems = (adminUser: boolean) => {
    const userDropdownItems: React.ReactNode[] = [];

    userDropdownItems.push(
      <BareDropdown.Item
        key="downloads"
        text={
          <a
            className={cs.option}
            href="/bulk_downloads"
            onClick={() =>
              trackEvent("Header_dropdown-downloads-option_clicked")
            }
          >
            Downloads
          </a>
        }
      />,
    );

    adminUser &&
      userDropdownItems.push(
        <BareDropdown.Item
          key="user_settings"
          text={
            <a
              className={cs.option}
              href="/user_settings"
              onClick={() =>
                trackEvent("Header_dropdown-user-settings-option_clicked")
              }
            >
              Settings
            </a>
          }
        />,
      );

    userDropdownItems.push(
      <BareDropdown.Item
        key="help"
        text={
          <ExternalLink
            className={cs.option}
            href="https://help.czid.org"
            analyticsEventName={"Header_dropdown-help-option_clicked"}
          >
            Help Center
          </ExternalLink>
        }
      />,
      <BareDropdown.Item
        key="feedback"
        text={
          <a
            className={cs.option}
            href={`mailto:${email}?Subject=Report%20Feedback`}
            onClick={() =>
              trackEvent("Header_dropdown-feedback-option_clicked")
            }
          >
            Contact Us
          </a>
        }
      />,
    );

    adminUser &&
      userDropdownItems.push(
        <BareDropdown.Item
          key="create_user"
          text={
            <a
              className={cs.option}
              href="/users/new"
              data-testid="create-user"
            >
              Create User
            </a>
          }
        />,
      );

    userDropdownItems.push(
      <BareDropdown.Divider key="divider_one" />,
      TermsDropdownItem,
      PrivacyDropdownItem,
    );

    userDropdownItems.push(
      <BareDropdown.Divider key="divider_two" />,
      <BareDropdown.Item
        key="logout"
        text="Logout"
        onClick={withAnalytics(
          signOut,
          "Header_dropdown-logout-option_clicked",
        )}
      />,
    );
    return userDropdownItems;
  };

  return (
    <div>
      <BareDropdown
        trigger={<div className={cs.userName}>{userName}</div>}
        className={cs.userDropdown}
        items={renderItems(adminUser)}
        direction="left"
      />
    </div>
  );
};

export const TermsDropdownItem = (
  <BareDropdown.Item
    key="terms_of_service"
    text={
      <a
        className={cs.option}
        target="_blank"
        rel="noopener noreferrer"
        href="/terms"
        onClick={() => trackEvent("Header_dropdown-terms-option_clicked")}
      >
        Terms of Use
      </a>
    }
  />
);

export const PrivacyDropdownItem = (
  <BareDropdown.Item
    key="privacy_notice"
    text={
      <a
        className={cs.option}
        target="_blank"
        rel="noopener noreferrer"
        href="/privacy"
        onClick={() =>
          trackEvent("Header_dropdown-privacy-notice-option_clicked")
        }
      >
        Privacy Notice
      </a>
    }
  />
);

export const TermsMenuDropDown = () => {
  return (
    <div>
      <BareDropdown
        trigger={<div className={cs.terms}>{"Terms"}</div>}
        className={cs.termsDropdown}
        items={[TermsDropdownItem, PrivacyDropdownItem]}
        direction="left"
      />
    </div>
  );
};

export default UserMenuDropDown;
