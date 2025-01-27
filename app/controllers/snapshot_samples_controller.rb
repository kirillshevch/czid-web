class SnapshotSamplesController < SamplesController
  include SamplesHelper
  include SnapshotSamplesHelper

  SNAPSHOT_ACTIONS = [
    :backgrounds,
    :coverage_viz_data,
    :coverage_viz_summary,
    :dimensions,
    :index_v2,
    :metadata_fields,
    :metadata,
    :report_v2,
    :show,
    :stats,
  ].freeze

  # Snapshot endpoints are publicly accessible but access control is checked by set_snapshot_sample and share_id
  skip_before_action :authenticate_user!, :set_sample, :check_access, only: SNAPSHOT_ACTIONS

  before_action :app_config_required
  before_action :check_snapshot_exists, except: [:backgrounds]
  before_action :set_snapshot_sample, only: [
    :coverage_viz_data,
    :coverage_viz_summary,
    :metadata,
    :report_v2,
    :show,
  ]
  before_action :block_action, except: SNAPSHOT_ACTIONS

  MAX_PAGE_SIZE_V2 = 100

  # GET /pub/:share_id/samples/:id
  def show
    background_id = JSON.parse(@snapshot.content)["background_id"]

    respond_to do |format|
      format.html
      format.json do
        render json: @sample
          .as_json(
            methods: [],
            only: SAMPLE_DEFAULT_FIELDS,
            include: {
              project: {
                only: [:id, :name],
              },
            }
          ).merge(
            default_pipeline_run_id: @pipeline_run_id,
            background_id: background_id,
            pipeline_runs: @sample.pipeline_runs_info,
            deletable: false,
            editable: false
          )
      end
    end
  end

  # GET /pub/:share_id/samples/:id/report_v2
  def report_v2
    if params[:background].nil?
      params[:background] = JSON.parse(@snapshot.content)["background_id"]
    end
    super
  end

  # GET /pub/:share_id/samples/index_v2.json
  def index_v2
    # Snapshot samples only suppoprt mNGS samples currently (as of 03-03-2021)
    share_id = snapshot_sample_params[:share_id]
    order_by = snapshot_sample_params[:orderBy] || :id
    order_dir = snapshot_sample_params[:orderDir] || :desc
    limit = snapshot_sample_params[:limit] ? snapshot_sample_params[:limit].to_i : MAX_PAGE_SIZE_V2
    offset = snapshot_sample_params[:offset].to_i

    list_all_sample_ids = ActiveModel::Type::Boolean.new.cast(snapshot_sample_params[:listAllIds])
    samples = samples_by_share_id(share_id)

    samples = filter_samples(samples, snapshot_sample_params)
    samples = samples.order(Hash[order_by => order_dir])

    limited_samples = samples.offset(offset).limit(limit)
    limited_samples_json = limited_samples.includes(:project).as_json(
      only: [:id, :name, :host_genome_id, :created_at],
      methods: []
    )

    # if basic is true, this endpoint only returns basic sample info (id, name, created_at, host_genome_id)
    basic = ActiveModel::Type::Boolean.new.cast(snapshot_sample_params[:basic])
    unless basic
      sample_ids = (samples || []).map(&:id)
      pipeline_runs_by_sample_id = snapshot_pipeline_runs_multiget(sample_ids, share_id)
      details_json = format_samples(limited_samples, selected_pipeline_runs_by_sample_id: pipeline_runs_by_sample_id, is_snapshot: true).as_json(
        except: [:sfn_results_path]
      )
      limited_samples_json.zip(details_json).map do |sample, details|
        sample[:details] = details
      end
    end

    results = { samples: limited_samples_json }
    results[:all_samples_ids] = samples.pluck(:id) if list_all_sample_ids
    render json: results
  end

  # GET /pub/:share_id/backgrounds.json
  def backgrounds
    @snapshot = SnapshotLink.find_by(share_id: snapshot_sample_params[:share_id])
    @backgrounds = @snapshot.fetch_snapshot_backgrounds
    render json: { other_backgrounds: @backgrounds, owned_backgrounds: [] }
  end

  # GET /pub/:share_id/samples/stats.json
  def stats
    # Access checked by samples_by_share_id
    super
  end

  # GET /pub/:share_id/samples/dimensions.json
  def dimensions
    # Access checked by samples_by_share_id
    super
  end

  # GET /pub/:share_id/samples/:id/metadata
  def metadata
    # Access checked by set_snapshot_sample
    super
  end

  # GET /pub/:share_id/samples/metadata_fields
  def metadata_fields
    share_id = snapshot_sample_params[:share_id]
    sample_ids = (snapshot_sample_params[:sampleIds] || []).map(&:to_i)
    snapshot_samples = samples_by_share_id(share_id)
    sample = snapshot_samples.find_by(id: sample_ids[0])
    results = sample.present? ? sample.metadata_fields_info : []
    render json: results
  end

  # GET /pub/:share_id/samples/:id/coverage_viz_summary
  def coverage_viz_summary
    # Access checked by set_snapshot_sample
    super
  end

  # GET /pub/:share_id/samples/:id/coverage_viz_data
  def coverage_viz_data
    # Access checked by set_snapshot_sample
    super
  end

  private

  def block_action
    redirect_to page_not_found_path
  end

  def app_config_required
    unless get_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING) == "1"
      block_action
    end
  end

  def check_snapshot_exists
    @snapshot = SnapshotLink.find_by(share_id: snapshot_sample_params[:share_id])
    if @snapshot.blank?
      block_action
    end
  end

  def set_snapshot_sample
    # content stored as
    # {"samples":
    #   [{1: {"pipeline_run_id": 12345}},
    #    {2: {"pipeline_run_id": 12345}}]
    # }
    content = JSON.parse(@snapshot.content)
    content["samples"].each do |sample|
      sample.each do |id, info|
        if id.to_i == snapshot_sample_params[:id].to_i
          # TODO(ihan) add support for the "Update samples if they're rerun" option
          @sample = Sample.find(id.to_i)
          @share_id = snapshot_sample_params[:share_id]
          @pipeline_run_id = info["pipeline_run_id"]
          break
        end
      end
    end

    if @sample.blank?
      block_action
    end
  end

  def snapshot_sample_params
    permitted_params = [:share_id, :id, :orderBy, :orderDir, :limit, :offset, :listAllIds, :basic, :host,
                        :location, :locationV2, :taxon, :time, :tissue, :search, sampleIds: [], time: [], tissue: [], host: [],]
    params.permit(*permitted_params)
  end
end
