// NOTE(2021-07-22): DiscoveryViewRouter is intended to be the main entrypoint
// into frontend routing in our single-page-ish application. We are creating it
// at this level for namespacing but it could be elevated later on.
//
// - <Switch>s can exist at any level in the routing tree.
// - <Route> works from top-to-bottom, rendering whichever path matches first.
// - See https://reactrouter.com/web/api/match for the properties you can get from 'match' (params, isExact, path, and url).

import React, { useContext } from "react";
import { Route, Switch } from "react-router-dom";

import { UserContext } from "~/components/common/UserContext";
import ImpactPage from "~/components/views/ImpactPage";
import LandingV2 from "~/components/views/LandingV2";
import SampleView from "~/components/views/SampleView/SampleView";
import DiscoveryView from "~/components/views/discovery/DiscoveryView";
import PathogenListView from "~/components/views/pathogen_list/PathogenListView";
import PhyloTreeListView from "~/components/views/phylo_tree/PhyloTreeListView";
import PrivacyNoticeForUserResearch from "~/components/views/support/PrivacyNoticeForUserResearch";

// These props come from Rails .html.erb views via the react_component function in app/assets/src/index.jsx (the entrypoint)
interface DiscoveryViewRouterProps {
  admin: boolean;
  domain: string;
  mapTilerKey: string;
  projectId: number;
  snapshotProjectDescription: string;
  snapshotProjectName: string;
  snapshotShareId: string;
  updateDiscoveryProjectId: $TSFixMeFunction;
  announcementBannerEnabled: boolean;
  emergencyBannerMessage: string;
}

const DiscoveryViewRouter = ({
  admin,
  domain,
  mapTilerKey,
  projectId,
  snapshotProjectDescription,
  snapshotProjectName,
  snapshotShareId,
  updateDiscoveryProjectId,
  announcementBannerEnabled,
  emergencyBannerMessage,
}: DiscoveryViewRouterProps) => {
  const { userSignedIn } = useContext(UserContext);

  return (
    <Switch>
      <Route exact path="/impact">
        <ImpactPage />
      </Route>
      <Route exact path="/pathogen_list">
        <PathogenListView />
      </Route>
      <Route exact path="/privacy_notice_for_user_research">
        <PrivacyNoticeForUserResearch />
      </Route>
      <Route
        path="/phylo_tree_ngs/:id"
        render={({ match }) => (
          <PhyloTreeListView
            selectedPhyloTreeNgId={parseInt(match.params.id)}
          />
        )}
      />
      <Route
        path="/samples/:id"
        render={({ match }) => (
          <SampleView sampleId={parseInt(match.params.id)} />
        )}
      />
      <Route
        path="/pub/:snapshotShareId/samples/:sampleId"
        render={({ match }) => (
          <SampleView
            sampleId={parseInt(match.params.sampleId)}
            snapshotShareId={match.params.snapshotShareId}
          />
        )}
      />
      <Route
        path="/pub/:snapshotShareId"
        render={({ match }) => (
          <DiscoveryView
            domain={domain}
            projectId={projectId}
            snapshotProjectDescription={snapshotProjectDescription}
            snapshotProjectName={snapshotProjectName}
            snapshotShareId={match.params.snapshotShareId}
          />
        )}
      />
      {userSignedIn ? (
        <Route>
          <DiscoveryView
            admin={admin}
            domain={domain}
            mapTilerKey={mapTilerKey}
            projectId={projectId}
            snapshotProjectDescription={snapshotProjectDescription}
            snapshotProjectName={snapshotProjectName}
            snapshotShareId={snapshotShareId}
            updateDiscoveryProjectId={updateDiscoveryProjectId}
          />
        </Route>
      ) : (
        <Route>
          <LandingV2
            announcementBannerEnabled={announcementBannerEnabled}
            emergencyBannerMessage={emergencyBannerMessage}
          />
        </Route>
      )}
    </Switch>
  );
};

export default DiscoveryViewRouter;
