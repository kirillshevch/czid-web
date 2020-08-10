class SnapshotSamplesController < SamplesController
  include SamplesHelper
  include SnapshotSamplesHelper

  SNAPSHOT_ACTIONS = [:show, :report_v2, :index_v2, :backgrounds].freeze

  # Snapshot endpoints are publicly accessible but access control is checked by set_snapshot_sample and share_id
  skip_before_action :authenticate_user!, :set_sample, :check_access, only: SNAPSHOT_ACTIONS

  before_action :app_config_required
  before_action :set_snapshot_sample, except: [:backgrounds, :index_v2]
  before_action :block_action, except: SNAPSHOT_ACTIONS

  MAX_PAGE_SIZE_V2 = 100

  # GET /pub/:share_id/samples/:id
  def show
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
            default_background_id: @sample.default_background_id,
            pipeline_runs: @sample.pipeline_runs_info,
            deletable: false,
            editable: false
          )
      end
    end
  end

  # GET /pub/:share_id/samples/:id/report_v2
  def report_v2
    super
  end

  # GET /pub/:share_id/samples/index_v2.json
  def index_v2
    share_id = snapshot_sample_params[:share_id]
    order_by = snapshot_sample_params[:orderBy] || :id
    order_dir = snapshot_sample_params[:orderDir] || :desc
    limit = snapshot_sample_params[:limit] ? snapshot_sample_params[:limit].to_i : MAX_PAGE_SIZE_V2
    offset = snapshot_sample_params[:offset].to_i

    list_all_sample_ids = ActiveModel::Type::Boolean.new.cast(snapshot_sample_params[:listAllIds])
    samples = samples_by_share_id(share_id)

    if samples.present?
      samples = filter_samples(samples, snapshot_sample_params)
      samples = samples.order(Hash[order_by => order_dir])

      limited_samples = samples.offset(offset).limit(limit)
      limited_samples_json = limited_samples.includes(:project).as_json(
        only: [:id, :name, :host_genome_id, :created_at],
        methods: []
      )

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
    else
      block_action
    end
  end

  # GET /pub/backgrounds.json
  def backgrounds
    @backgrounds = Background.where(public_access: 1)
    render json: { backgrounds: @backgrounds }
  end

  private

  def app_config_required
    unless get_app_config(AppConfig::ENABLE_SNAPSHOT_SHARING) == "1"
      redirect_to root_path
    end
  end

  def block_action
    redirect_to root_path
  end

  def set_snapshot_sample
    snapshot = SnapshotLink.find_by(share_id: snapshot_sample_params[:share_id])
    if snapshot.present?
      # content stored as
      # {"samples":
      #   [{1: {"pipeline_run_id": 12345}},
      #    {2: {"pipeline_run_id": 12345}}]
      # }
      content = JSON.parse(snapshot.content)
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
    end

    if @sample.nil?
      block_action
    end
  end

  def snapshot_sample_params
    permitted_params = [:share_id, :id, :orderBy, :orderDir, :limit, :offset, :listAllIds, :basic, :host, :location, :locationV2, :taxon, :time, :tissue, :search, :sampleIds]
    params.permit(*permitted_params)
  end
end
