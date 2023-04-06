# This service performs the immediate actions necessary for bulk
# deletion of pipeline or workflow runs, then kicks off an async job
# to hard delete the runs.
# It accepts deletable workflow run ids or sample ids as object_ids argument, user,
# and workflow. It returns an array of deleted pipeline run or workflow run ids and
# an array of deleted sample ids.
class BulkDeletionService
  include Callable

  def initialize(object_ids:, user:, workflow:)
    if object_ids.blank?
      Rails.logger.warn("BulkDeletionService called with object_ids = nil")
      @object_ids = []
    else
      @object_ids = object_ids.map(&:to_i)
    end

    if workflow.nil?
      raise DeletionValidationService::WorkflowMissingError
    end

    @user = user
    @workflow = workflow
  end

  def call
    error = nil
    deleted_run_ids = []
    deleted_sample_ids = []

    begin
      deleted_objects = bulk_delete_objects(object_ids: @object_ids, workflow: @workflow, user: @user)
    rescue StandardError => e
      LogUtil.log_error(
        "BulkDeletionEvent: Unexpected issue handling bulk deletion of objects: #{e}",
        exception: e,
        object_ids: @object_ids,
        workflow: @workflow,
        user_id: @user.id
      )
      error = "Bulk Deletion Error: #{e}"
    end

    if error.nil?
      deleted_run_ids = deleted_objects[:deleted_run_ids]
      deleted_sample_ids = deleted_objects[:deleted_sample_ids]
    end

    return {
      deleted_run_ids: deleted_run_ids,
      deleted_sample_ids: deleted_sample_ids,
      error: error,
    }
  end

  private

  def bulk_delete_objects(object_ids:, workflow:, user:)
    current_power = Power.new(user)
    delete_timestamp = Time.now.utc

    # If mngs, get pipeline runs from sample ids and clean up visualizations.
    # If workflow runs, get workflow run objects from workflow run ids.
    if WorkflowRun::MNGS_WORKFLOWS.include?(workflow)
      technology = WorkflowRun::MNGS_WORKFLOW_TO_TECHNOLOGY[workflow]
      deletable_objects = current_power.deletable_pipeline_runs.where(sample_id: object_ids, technology: technology)
      sample_ids = object_ids # allows us to delete samples with failed uploads but no pipeline runs
      handle_visualizations(sample_ids)
    else
      deletable_objects = current_power.deletable_workflow_runs.where(id: object_ids).by_workflow(workflow).non_deprecated
      sample_ids = deletable_objects.pluck(:sample_id)
    end

    handle_bulk_downloads(deletable_objects, delete_timestamp)

    # Skip validations so that we can update old samples that would otherwise fail
    # new validation checks added since they were created
    # rubocop:disable Rails/SkipsModelValidations
    deletable_objects.update_all(deleted_at: delete_timestamp)
    # rubocop:enable Rails/SkipsModelValidations

    count_by_workflow = get_workflow_counts(sample_ids)
    samples = current_power.destroyable_samples.where(id: sample_ids)
    soft_deleted_sample_ids = update_initial_workflows_or_soft_delete(samples, workflow, delete_timestamp, count_by_workflow)

    # log soft deletion for GDPR compliance
    deleted_objects_info = deletable_objects
                           .joins(:sample)
                           .select(:id, "sample_id", "samples.name AS sample_name", "samples.user_id AS sample_user_id").as_json

    MetricUtil.log_analytics_event(
      EventDictionary::GDPR_RUN_SOFT_DELETED,
      user,
      {
        user_email: user.email,
        deleted_objects: deleted_objects_info,
        workflow: workflow,
      }
    )

    ids_to_hard_delete = deletable_objects.pluck(:id)
    Resque.enqueue(HardDeleteObjects, ids_to_hard_delete, soft_deleted_sample_ids, workflow, user.id)

    return {
      deleted_run_ids: ids_to_hard_delete,
      deleted_sample_ids: soft_deleted_sample_ids,
    }
  end

  # Get counts for all samples using 4 queries
  # Get hash of sample ids that have a workflow of each type in the form
  # count = { [workflow] => set(sample_id1, sample_id2...) }
  def get_workflow_counts(sample_ids)
    counts = {}
    counts["short-read-mngs"] = PipelineRun.where(
      sample_id: sample_ids,
      deleted_at: nil,
      deprecated: false,
      technology: PipelineRun::TECHNOLOGY_INPUT[:illumina]
    ).pluck(:sample_id).to_set

    counts["long-read-mngs"] = PipelineRun.where(
      sample_id: sample_ids,
      deleted_at: nil,
      deprecated: false,
      technology: PipelineRun::TECHNOLOGY_INPUT[:nanopore]
    ).pluck(:sample_id).to_set

    counts["consensus-genome"] = WorkflowRun.where(
      sample_id: sample_ids,
      deleted_at: nil,
      deprecated: false,
      workflow: WorkflowRun::WORKFLOW[:consensus_genome]
    ).pluck(:sample_id).to_set

    counts["amr"] = WorkflowRun.where(
      sample_id: sample_ids,
      deleted_at: nil,
      deprecated: false,
      workflow: WorkflowRun::WORKFLOW[:amr]
    ).pluck(:sample_id).to_set

    counts
  end

  # If there are more remaining runs on the sample, update initial workflow
  # otherwise mark it for deletion
  def update_initial_workflows_or_soft_delete(samples, workflow_to_delete, timestamp, count_by_workflow)
    soft_deleted_sample_ids = []
    samples.each do |sample|
      if sample.initial_workflow == workflow_to_delete
        new_initial_workflow = get_new_initial_workflow(sample.id, workflow_to_delete, count_by_workflow)
        # rubocop:disable Rails/SkipsModelValidations
        if new_initial_workflow.nil?
          # no more remaining pipeline/workflow runs
          sample.update_attribute(:deleted_at, timestamp)
          soft_deleted_sample_ids << sample.id
        else
          sample.update_attribute(:initial_workflow, new_initial_workflow)
        end
        # rubocop:enable Rails/SkipsModelValidations
      end
    end
    return soft_deleted_sample_ids
  end

  # Find new initial workflow to reflect remaining analysis types on the sample
  def get_new_initial_workflow(sample_id, workflow_to_delete, count_by_workflow)
    # keep same initial workflow if there are more runs of that type (CG only right now)
    if count_by_workflow[workflow_to_delete].include?(sample_id)
      return workflow_to_delete
    end

    # hashes enumerate their values in the order the keys were inserted
    # so this will check short read mNGS -> long read mNGS -> CG -> AMR
    count_by_workflow.each do |workflow, sample_ids|
      if sample_ids.include?(sample_id)
        return workflow
      end
    end
    return nil
  end

  # Update or delete visualizations associated with the samples for these pipeline runs
  def handle_visualizations(sample_ids)
    visualizations = Visualization.joins(:samples).where("sample_id IN (?)", sample_ids).distinct

    # Table/Tree visualizations are only associated with one sample (unrelated to phylotree).
    visualizations.where(visualization_type: ["table", "tree"]).each(&:destroy)

    # Remove samples from existing heatmaps (heatmaps have >2 samples).
    heatmaps = visualizations.where(visualization_type: "heatmap")
    heatmaps.each do |heatmap|
      n_samples_after_deletion = heatmap.sample_ids.length - heatmap.sample_ids.to_a.count { |sample_id| sample_ids.include? sample_id }

      # If too few samples will be left after deletion, remove the heatmap entirely
      if n_samples_after_deletion < 2
        heatmap.destroy!
      # Otherwise, only remove the samples from the heatmap
      else
        heatmap.samples = heatmap.samples.select { |sample| sample_ids.exclude? sample.id }
      end
    end
  end

  # Mark associated bulk downloads for deletion.
  def handle_bulk_downloads(deletable_objects, delete_timestamp)
    # Unlike `.update`, `.update_attribute` & `.update_all` skip model validations (i.e.
    # column X must satisfy certain conditions), and skips updating `updated_at`. This is needed to make sure we mark
    # for deletion old rows that were created before we added new validations to the model (which would now fail, but
    # we still want to delete them regardless), e.g. see `validate :params_checks` in bulk_download.rb.
    # rubocop:disable Rails/SkipsModelValidations
    deletable_objects.each do |run|
      run.bulk_downloads.update_all(deleted_at: delete_timestamp)
    end
    # rubocop:enable Rails/SkipsModelValidations
  end
end
