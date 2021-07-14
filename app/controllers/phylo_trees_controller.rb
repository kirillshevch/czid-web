class PhyloTreesController < ApplicationController
  include ApplicationHelper
  include SamplesHelper
  include PipelineRunsHelper
  include ElasticsearchHelper
  include ParameterSanitization

  ########################################
  # Current logic for phylo_tree permissions:
  # 1. index/show permissions are based on viewability of all the samples
  #    that make up the tree.
  # 2. create/edit permissions are based on
  #    a. viewability of all the samples
  #    b. the project the tree belongs to
  #       (if 2 users belong to the same project, they are considered
  #        collaborators and so they can both create/edit trees for the project).
  # While project membership is used to confer create/edit permission,
  # trees created for a project may in fact contain samples from outside
  # the project. Such trees will be hidden from members of the project that do not
  # have read access to all those samples.
  ########################################

  READ_ACTIONS = [:show, :download].freeze
  EDIT_ACTIONS = [:retry].freeze
  OTHER_ACTIONS = [:new, :create, :index, :choose_taxon, :validate_name].freeze

  power :phylo_trees, map: { EDIT_ACTIONS => :updatable_phylo_trees }, as: :phylo_trees_scope

  before_action :set_phylo_tree, only: READ_ACTIONS + EDIT_ACTIONS
  before_action :assert_access, only: OTHER_ACTIONS
  before_action :check_access

  # This limit determines how many rows can be displayed in "additional samples".
  # This limit was added because the phylo tree creation was timing out for admins
  # and otherwise the results will grow without bound per user.
  ELIGIBLE_PIPELINE_RUNS_LIMIT = 1000
  PIPELINE_RUN_IDS_WITH_TAXID_LIMIT = 10_000

  def index
    @project = []
    # Common use case is looking for the most recently created phylo tree
    @phylo_trees = current_power.phylo_trees.order(updated_at: :desc)
    @taxon = {}

    taxid = params[:taxId]
    if HUMAN_TAX_IDS.include? taxid.to_i
      render json: { status: :forbidden, message: "Human taxon ids are not allowed" }
      return
    end
    project_id = params[:projectId]

    # Restrict to specified project
    if project_id
      @project = current_power.projects.find(project_id)
      @phylo_trees = @phylo_trees.where(project_id: project_id)
    end

    # Restrict to specified taxid
    if taxid
      @phylo_trees = @phylo_trees.where(taxid: taxid)
      taxon_name = TaxonLineage.where(taxid: taxid).last.name
    end

    # Augment tree data with user name
    users_map = PhyloTree.users_by_tree_id
    @phylo_trees = @phylo_trees.as_json
    @phylo_trees.each do |pt|
      pt["user"] = users_map[pt["id"]]
    end

    respond_to do |format|
      format.html
      format.json do
        render json: {
          project: @project,
          taxonName: taxon_name,
          phyloTrees: @phylo_trees,
        }
      end
    end
  end

  def show
    pt = @phylo_tree.as_json(only: ["id", "name", "taxid", "tax_level", "tax_name", "newick", "status"])
    pt["user"] = @phylo_tree.user.name
    pt["parent_taxid"] = TaxonLineage.where(taxid: @phylo_tree.taxid).last.genus_taxid if @phylo_tree.tax_level == 1

    nodes = {}
    # populate metadata for sample nodes
    metadata_by_sample_id = Metadatum.by_sample_ids(@phylo_tree.pipeline_runs.pluck(:sample_id).uniq, use_raw_date_strings: true)
    @phylo_tree.pipeline_runs
               .joins(:sample, sample: [:project, :host_genome])
               .select("pipeline_runs.id, samples.id as sample_id," \
                       "samples.name, projects.name as project_name," \
                       "host_genomes.name as host_genome_name")
               .as_json.each do |pr|
      nodes[pr["id"]] = {
        "pipeline_run_id" => pr["id"],
        "sample_id" => pr["sample_id"],
        "name" => pr["name"],
        "project_name" => pr["project_name"],
        "host_genome_name" => pr["host_genome_name"],
        "metadata" => metadata_by_sample_id[pr["sample_id"]],
      }
    end
    # populate metadata for NCBI nodes
    ncbi_metadata = JSON.parse(@phylo_tree.ncbi_metadata || "{}")
    ncbi_metadata.each do |node_id, node_metadata|
      nodes[node_id] = node_metadata
      nodes[node_id]["name"] ||= node_metadata["accession"]
    end
    # add node information to phylo_tree json
    pt["sampleDetailsByNodeName"] = nodes

    respond_to do |format|
      format.html
      format.json do
        render json: pt
      end
    end
  end

  # NOTE: this is used by the report page as well as phylo trees
  # See https://jira.czi.team/browse/IDSEQ-2127
  def choose_taxon
    taxon_search_args = [params[:query]]
    taxon_search_args << params[:args].split(",") if params[:args].present?
    filters = {}
    if params[:projectId]
      filters[:projectId] = current_power.projects.find(params[:projectId]).id
    end
    if params[:sampleId]
      # Note: 'where' because downstream expects a Relation.
      filters[:samples] = current_power.samples.where(id: params[:sampleId])
    end
    taxon_search_args << filters
    taxon_list = taxon_search(*taxon_search_args)
    render json: JSON.dump(taxon_list)
  end

  def new
    taxid = params[:taxId].to_i
    if HUMAN_TAX_IDS.include? taxid.to_i
      render json: { status: :forbidden, message: "Human taxon ids are not allowed" }
      return
    end
    project_id = params[:projectId].to_i

    @project = current_power.updatable_projects.find(project_id)

    # Retrieve the top (most recent) pipeline runs from samples that contains the specified taxid.
    eligible_pipeline_runs = current_power.pipeline_runs.top_completed_runs
    pipeline_run_ids_with_taxid = TaxonByterange.where(taxid: taxid).order(id: :desc).limit(PIPELINE_RUN_IDS_WITH_TAXID_LIMIT).pluck(:pipeline_run_id)
    eligible_pipeline_run_ids_with_taxid =
      eligible_pipeline_runs.where(id: pipeline_run_ids_with_taxid)
                            .order(id: :desc).limit(ELIGIBLE_PIPELINE_RUNS_LIMIT).pluck(:id)
    # Always include the project's top pipeline runs (in case they were excluded due to the ELIGIBLE_PIPELINE_RUNS_LIMIT)
    project_pipeline_run_ids_with_taxid = TaxonByterange.joins(pipeline_run: [{ sample: :project }]).where(taxid: taxid, samples: { project_id: project_id }).pluck(:pipeline_run_id)
    top_project_pipeline_run_ids_with_taxid = current_power.pipeline_runs.where(id: project_pipeline_run_ids_with_taxid).top_completed_runs.pluck(:id)

    # Retrieve information for displaying the tree's sample list.
    pipeline_run_ids = (eligible_pipeline_run_ids_with_taxid | top_project_pipeline_run_ids_with_taxid).uniq
    @samples = sample_details_json(
      pipeline_run_ids,
      taxid
    )

    # Retrieve information about the taxon
    taxon_lineage = TaxonLineage.where(taxid: taxid).last
    @taxon = { taxid: taxid,
               name: taxon_lineage.name, }

    respond_to do |format|
      format.html
      format.json do
        render json: {
          project: @project,
          taxon: @taxon,
          samples: @samples,
          csrf: form_authenticity_token,
        }
      end
    end
  end

  def validate_name
    # current flow saves a sanitized name, thus use the same sanitized name to check
    name = sanitize_title_name(params[:name])
    pt = PhyloTree.new(name: name)
    pt.valid?
    render json: {
      valid: !pt.errors.key?(:name),
      sanitizedName: name,
    }
  end

  def retry
    if @phylo_tree.status == PhyloTree::STATUS_FAILED
      @phylo_tree.update(status: PhyloTree::STATUS_INITIALIZED,
                         job_id: nil, job_log_id: nil, job_description: nil, command_stdout: nil, command_stderr: nil)
      Resque.enqueue(KickoffPhyloTree, @phylo_tree.id)
      render json: { status: :ok, message: "retry submitted" }
    else
      render json: { status: :conflict, message: "a tree run is already in progress for this project and taxon" }
    end
  end

  def download
    output = params[:output]
    local_file = Tempfile.new
    s3_file = @phylo_tree[output]
    if s3_file && download_to_filename?(s3_file, local_file.path)
      send_file local_file.path, filename: "#{@phylo_tree.name.downcase.gsub(/\W/, '-')}__#{File.basename(s3_file)}"
    else
      local_file.close
      LogUtil.log_error("downloading #{s3_file} failed", s3_file: s3_file)
      head :not_found
    end
  end

  def create
    taxid = params[:taxId].to_i
    if HUMAN_TAX_IDS.include? taxid.to_i
      render json: { status: :forbidden, message: "Human taxon ids are not allowed" }
      return
    end

    @project = current_power.updatable_projects.find(params[:projectId])
    pipeline_run_ids = params[:pipelineRunIds].map(&:to_i)

    name = sanitize_title_name(params[:name])
    tax_name = params[:taxName]
    dag_branch = if current_user.admin?
                   params[:dagBranch] || "main"
                 else
                   "main"
                 end
    dag_vars = params[:dagVars] if current_user.admin?

    tax_level = TaxonLineage.where(taxid: taxid).last.tax_level

    non_viewable_pipeline_run_ids = pipeline_run_ids.to_set - current_power.pipeline_runs.pluck(:id).to_set
    if !non_viewable_pipeline_run_ids.empty?
      render json: {
        status: :unauthorized,
        message: "You are not authorized to view all pipeline runs in the list.",
      }
    else
      pt = PhyloTree.new(name: name, taxid: taxid, tax_level: tax_level, tax_name: tax_name, user_id: current_user.id, project_id: @project.id, pipeline_run_ids: pipeline_run_ids, dag_branch: dag_branch, dag_vars: dag_vars)
      if pt.save
        Resque.enqueue(KickoffPhyloTree, pt.id)
        Rails.logger.info("PhyloTreeCreation: Starting to run phylo tree job #{name}...")
        render json: { status: :ok, message: "tree creation job submitted", phylo_tree_id: pt.id }
      else
        render json: { status: :not_acceptable, message: pt.errors.full_messages }
      end
    end
  end

  private

  def set_phylo_tree
    @phylo_tree = phylo_trees_scope.find(params[:id])
    assert_access
  end

  def sample_details_json(pipeline_run_ids, taxid)
    return [] if pipeline_run_ids.blank?
    return [] if HUMAN_TAX_IDS.include? taxid.to_i

    # Retrieve information for displaying the tree's sample list.
    # Expose it as an array of hashes containing
    # - sample name
    # - project id and name
    # - pipeline run id to be used for the sample.
    sanitized_sql_statement = ActiveRecord::Base.sanitize_sql_array(["
      select
        samples.name,
        samples.project_id as project_id,
        samples.created_at as created_at,
        host_genomes.name as host,
        projects.name as project_name,
        pipeline_runs.id as pipeline_run_id,
        samples.id as sample_id,
        COUNT(DISTINCT(contigs.id)) as num_contigs
      from pipeline_runs, projects, samples, host_genomes, contigs
      where
        pipeline_runs.id in (:pipeline_run_ids) and
        pipeline_runs.sample_id = samples.id and
        samples.project_id = projects.id and
        host_genomes.id = samples.host_genome_id and
        contigs.pipeline_run_id = pipeline_runs.id and (
          contigs.species_taxid_nt = :taxid or
          contigs.genus_taxid_nt = :taxid or
          contigs.species_taxid_nr = :taxid or
          contigs.genus_taxid_nt = :taxid
        )
      group by samples.name, pipeline_runs.id
    ",
                                                                     pipeline_run_ids: pipeline_run_ids.join(","),
                                                                     taxid: tax_id,])

    samples_projects = Sample.connection.select_all(sanitized_sql_statement).to_a

    metadata_by_sample_id = Metadatum.by_sample_ids(samples_projects.pluck("sample_id"), use_raw_date_strings: true)
    samples_projects.each do |sp|
      if metadata_by_sample_id[sp["sample_id"]]
        sp["tissue"] = metadata_by_sample_id[sp["sample_id"]][:sample_type]
        sp["location"] = metadata_by_sample_id[sp["sample_id"]][:collection_location_v2]
      end
    end

    samples_projects
  end
end
