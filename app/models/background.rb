# A background model is a statistical representation of the microbes found in a
# group of samples. Background models help filter out contaminants and noise
# when the user generates or selects an appropriate background model for their
# samples.
#
# See also:
# https://chanzuckerberg.zendesk.com/hc/en-us/articles/360050883054-Background-Models
#
# Background models are generated from specific PipelineRuns and the taxa in those runs.
class Background < ApplicationRecord
  has_and_belongs_to_many :pipeline_runs
  has_many :samples, through: :pipeline_runs
  has_many :taxon_summaries, dependent: :destroy
  has_many :persisted_backgrounds, dependent: :destroy
  belongs_to :user, optional: true

  validate :validate_size
  validates :name, presence: true, uniqueness: { case_sensitive: false }
  # Not sure why this is not a boolean
  validates :ready, presence: true, inclusion: { in: [0, 1] }
  validate :mass_normalized_has_ercc

  after_save :submit_store_summary_job
  attr_accessor :just_updated

  DEFAULT_BACKGROUND_MODEL_NAME = "default".freeze
  TAXON_SUMMARY_CHUNK_SIZE = 100

  scope :created_by_idseq, -> { where(user: nil, public_access: 1) }

  def mass_normalized_has_ercc
    if mass_normalized &&
       PipelineRun.where('id in (?) AND (total_ercc_reads = 0 OR total_ercc_reads IS NULL)', pipeline_run_ids).count > 0
      errors.add(:base, 'cannot create a mass normalized background model from samples without erccs')
    end
  end

  def self.eligible_pipeline_runs
    PipelineRun.top_completed_runs.order(:sample_id)
  end

  # Returns the top backgrounds for a user for the purpose of precache_report_info.
  def self.top_for_sample(sample)
    public_access_bgs = where(public_access: true).where(ready: 1)
    user_bgs = where(user: sample.user).where(ready: 1)
    host_bgs = where(id: sample.host_genome.default_background_id).where(ready: 1)
    (public_access_bgs + user_bgs + host_bgs).uniq
  end

  def validate_size
    errors.add(:base, "Need to select at least 2 pipeline runs.") if pipeline_runs.size < 2
  end

  def summarize
    rows = TaxonCount.connection.select_all("
      SELECT
        tax_id,
        count,
        count_type,
        tax_level,
        total_ercc_reads,
        @adjusted_total_reads := (total_reads - IFNULL(total_ercc_reads, 0)) * IFNULL(fraction_subsampled, 1.0),
        (1.0*1e6*count)/@adjusted_total_reads as rpm
      FROM `taxon_counts`
      INNER JOIN `pipeline_runs` ON
        `pipeline_runs`.`id` = `taxon_counts`.`pipeline_run_id`
      WHERE (pipeline_run_id in (select pipeline_run_id from backgrounds_pipeline_runs where background_id = #{id}))
      ORDER BY tax_id, count_type, tax_level
    ").to_a
    n = pipeline_runs.count
    date = DateTime.now.in_time_zone
    key = ""
    taxon_result = {}
    result_list = []
    rows.each do |row|
      current_key = [row["tax_id"], row["count_type"], row["tax_level"]].join('-')
      if current_key != key
        if taxon_result[:tax_id] # empty for first row
          # add the taxon_result to result_list
          result_list << summarize_taxon(taxon_result, n, date)
        end
        # reset the results
        taxon_result = { tax_id: row["tax_id"], count_type: row["count_type"],
                         tax_level: row["tax_level"], sum_rpm: 0.0, sum_rpm2: 0.0,
                         rpm_list: [], rel_abundance_list_mass_normalized: [], }
        key = current_key
      end
      # increment
      taxon_result[:sum_rpm] += row["rpm"]
      taxon_result[:sum_rpm2] += row["rpm"]**2
      if row["total_ercc_reads"]
        mass_norm_count = row["count"] / row["total_ercc_reads"].to_f
        taxon_result[:sum_mass_norm_count] = (taxon_result[:sum_mass_norm_count] || 0.0) + mass_norm_count
        taxon_result[:sum_mass_norm_count2] = (taxon_result[:sum_mass_norm_count2] || 0.0) + mass_norm_count**2
        taxon_result[:rel_abundance_list_mass_normalized] << mass_norm_count.round(3)
      else
        taxon_result[:rel_abundance_list_mass_normalized] << nil
      end
      taxon_result[:rpm_list] << row["rpm"].round(3)
    end
    # addd the last result
    result_list << summarize_taxon(taxon_result, n, date)

    result_list
  end

  def summarize_taxon(taxon_result, n, date)
    taxon_result[:background_id] = id
    taxon_result[:created_at] = date
    taxon_result[:updated_at] = date
    taxon_result[:mean] = taxon_result[:sum_rpm] / n.to_f
    if mass_normalized?
      taxon_result[:mean_mass_normalized] = taxon_result[:sum_mass_norm_count] / n.to_f
      taxon_result[:stdev_mass_normalized] = compute_stdev(
        taxon_result[:sum_mass_norm_count],
        taxon_result[:sum_mass_norm_count2],
        n
      )
    else
      taxon_result[:mean_mass_normalized] = nil
      taxon_result[:stdev_mass_normalized] = nil
    end
    taxon_result[:stdev] = compute_stdev(taxon_result[:sum_rpm], taxon_result[:sum_rpm2], n)

    # add zeroes to the rpm_list and rel_abundance_list_mass_normalized for no presence to complete the list
    taxon_result[:rpm_list] << 0.0 while taxon_result[:rpm_list].size < n
    if taxon_result[:rel_abundance_list_mass_normalized].all?
      taxon_result[:rel_abundance_list_mass_normalized] << 0.0 while taxon_result[:rel_abundance_list_mass_normalized].size < n
      taxon_result[:rpm_list] = taxon_result[:rpm_list].to_json
    end

    taxon_result
  end

  def submit_store_summary_job
    Resque.enqueue(ComputeBackground, id) unless just_updated
  end

  def store_summary
    ActiveRecord::Base.transaction do
      ActiveRecord::Base.connection.execute <<-SQL
      DELETE FROM taxon_summaries WHERE background_id = #{id}
      SQL
      data = summarize.map { |h| h.slice(:tax_id, :count_type, :tax_level, :background_id, :created_at, :updated_at, :mean, :stdev, :mean_mass_normalized, :stdev_mass_normalized, :rpm_list) }
      data_chunks = data.in_groups_of(TAXON_SUMMARY_CHUNK_SIZE, false)
      data_chunks.each do |chunk|
        columns = chunk.first.keys
        values_list = chunk.map do |hash|
          hash.values.map do |value|
            ActiveRecord::Base.connection.quote(value)
          end
        end
        ActiveRecord::Base.connection.execute <<-SQL
        INSERT INTO taxon_summaries (#{columns.join(',')}) VALUES #{values_list.map { |values| "(#{values.join(',')})" }.join(', ')}
        SQL
      end
    end
    self.just_updated = true # to not trigger another background computation job
    update(ready: 1) # background will be displayed on report page
  end

  def compute_stdev(sum, sum2, n)
    x = (sum2 - sum**2 / n.to_f) / (n - 1)
    # In theory, x can mathematically be proven to be non-negative.
    # But in practice, rounding errors can make it slightly negative when it should be 0.
    x = [0, x].max
    Math.sqrt(x)
  end

  def destroy
    TaxonSummary.where(background_id: id).delete_all
    super
  end

  def self.viewable(user)
    if user.present? && user.admin?
      all
    else
      # Background is viewable by user if either
      # (A) user is allowed to view all pipeline_runs that went into the background, or
      # (B) background is marked as public (regardless of whether user is allowed to view individual pipeline_runs).
      condition_b = "public_access = 1"
      viewable_pipeline_run_ids = PipelineRun.where(sample_id: Sample.viewable(user).pluck(:id)).pluck(:id)
      condition_a = if viewable_pipeline_run_ids.empty?
                      "false"
                    else
                      "id not in (select background_id from backgrounds_pipeline_runs
                                  where pipeline_run_id not in (#{viewable_pipeline_run_ids.join(',')}))"
                    end
      condition = [condition_b, condition_a].join(" or ")
      where(condition)
    end
  end

  def mass_normalized?
    mass_normalized
  end
end
